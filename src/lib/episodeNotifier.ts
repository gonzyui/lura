import { container } from '@sapphire/framework';
import AnilistClient from './aniClient';
import { AiringSort } from 'ani-client';
import {
    ActionRowBuilder,
    ActivityType,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
    ThumbnailBuilder
} from 'discord.js';
import { redis } from './redis';

const LAST_CHECKED_KEY = 'lura:episode-notifier:lastChecked';
const LAST_ACTIVITY_KEY = 'lura:episode-notifier:lastActivity';
const SENT_PREFIX = 'lura:episode-notifier:sent:';
const SENT_TTL_SECONDS = 60 * 60 * 24 * 30;

type LastActivityPayload = {
    title: string;
    episode: number | string;
};

export class EpisodeNotifier {
    private lastChecked = Math.floor(Date.now() / 1000) - 3600;
    private isRunning = false;
    private timeout: NodeJS.Timeout | null = null;
    private hasLoadedState = false;

    private readonly pollInterval = 30_000;
    private readonly safetyMargin = 5;

    public start() {
        if (this.timeout || this.isRunning) {
            container.logger.warn('[AniClient] EpisodeNotifier is already running.');
            return;
        }

        void this.tick();
    }

    public stop() {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }

        this.isRunning = false;
        container.logger.info('[AniClient] EpisodeNotifier stopped.');
    }

    private scheduleNext() {
        this.timeout = setTimeout(() => {
            this.timeout = null;
            void this.tick();
        }, this.pollInterval);
    }

    private makeKey(schedule: any) {
        return `${schedule.id ?? `${schedule.media?.id}:${schedule.episode}:${schedule.airingAt}`}`;
    }

    private makeSentKey(schedule: any) {
        return `${SENT_PREFIX}${this.makeKey(schedule)}`;
    }

    private cleanDescription(description?: string | null) {
        let text =
            description
                ?.replace(/<[^>]*>/g, '')
                .replace(/\s+/g, ' ')
                .trim() || 'No synopsis available.';

        if (text.length > 700) {
            text = `${text.slice(0, 697)}...`;
        }

        return text;
    }

    private async loadState() {
        if (this.hasLoadedState) return;

        try {
            const savedLastChecked = await redis.get(LAST_CHECKED_KEY);
            if (savedLastChecked) {
                const parsed = Number(savedLastChecked);
                if (Number.isFinite(parsed) && parsed > 0) {
                    this.lastChecked = parsed;
                }
            }

            const savedActivity = await redis.get(LAST_ACTIVITY_KEY);
            if (savedActivity) {
                const parsed = JSON.parse(savedActivity) as LastActivityPayload;
                if (parsed?.title) {
                    container.client.user?.setActivity({
                        name: `Episode ${parsed.episode ?? '?'} of ${parsed.title}`,
                        type: ActivityType.Watching
                    });
                }
            }

            this.hasLoadedState = true;
            container.logger.info(`[AniClient] EpisodeNotifier state loaded. lastChecked=${this.lastChecked}`);
        } catch (error) {
            container.logger.error('[AniClient] Failed to load EpisodeNotifier state:', error);
        }
    }

    private async saveLastChecked(value: number) {
        await redis.set(LAST_CHECKED_KEY, String(value));
    }

    private async saveLastActivity(payload: LastActivityPayload) {
        await redis.set(LAST_ACTIVITY_KEY, JSON.stringify(payload));
    }

    private async tryMarkEpisodeSent(schedule: any) {
        const result = await redis.set(this.makeSentKey(schedule), '1', 'EX', SENT_TTL_SECONDS, 'NX');
        return result === 'OK';
    }

    private async getNewsChannel() {
        const channelId = process.env.NEWS_CHANNEL;

        if (!channelId) {
            container.logger.warn('[AniClient] NEWS_CHANNEL is not defined.');
            return null;
        }

        const cached = container.client.channels.cache.get(channelId);
        if (cached?.isSendable()) {
            return cached;
        }

        const fetched = await container.client.channels.fetch(channelId).catch(() => null);
        if (!fetched?.isSendable()) {
            container.logger.warn('[AniClient] News channel not found or not sendable.');
            return null;
        }

        return fetched;
    }

    private async tick() {
        if (this.isRunning) {
            container.logger.warn('[AniClient] Tick skipped: previous run still active.');
            return;
        }

        this.isRunning = true;
        container.logger.info('[AniClient] Interval tick.');

        try {
            await this.loadState();

            const channel = await this.getNewsChannel();
            if (!channel) return;

            const notif = await AnilistClient.getInstance()
                .getAniClient()
                .getAiredEpisodes({
                    airingAtGreater: Math.max(0, this.lastChecked - this.safetyMargin),
                    sort: [AiringSort.TIME],
                    perPage: 50
                });

            const results = (notif.results ?? [])
                .filter((schedule) => schedule?.airingAt && schedule.media)
                .sort((a, b) => a.airingAt - b.airingAt);

            container.logger.info(
                `[AniClient] API returned ${results.length} results. ${results.length > 0 ? `(${results.map((r) => r.media?.title?.english || r.media?.title?.romaji || r.media?.title?.native).join(', ')})` : '(Nothing)'}`
            );

            let maxAiringAtSeen = this.lastChecked;
            let latestActivity: LastActivityPayload | null = null;

            for (const schedule of results) {
                maxAiringAtSeen = Math.max(maxAiringAtSeen, schedule.airingAt ?? 0);

                const wasMarked = await this.tryMarkEpisodeSent(schedule);
                if (!wasMarked) continue;

                const media = schedule.media;
                const title = media.title?.english || media.title?.native || media.title?.romaji || 'Unknown title';
                const description = this.cleanDescription(media.description);

                const headerLine = ['## New episode released', `# ${title}`].join('\n');

                const detailsLine = [
                    `**Episode:** ${schedule.episode ?? 'Unknown'}`,
                    media.format ? `**Format:** ${media.format}` : null,
                    media.status ? `**Status:** ${media.status}` : null
                ]
                    .filter(Boolean)
                    .join(' • ');

                const messageContainer = new ContainerBuilder().setAccentColor(0xff1a64);

                const section = new SectionBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(headerLine),
                    new TextDisplayBuilder().setContent([detailsLine, description].filter(Boolean).join('\n\n'))
                );

                const thumb = media.coverImage?.extraLarge || media.coverImage?.large;
                if (thumb) {
                    section.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb).setDescription(`Cover image of ${title}`));
                }

                messageContainer.addSectionComponents(section);

                if (media.bannerImage) {
                    messageContainer.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

                    messageContainer.addMediaGalleryComponents(
                        new MediaGalleryBuilder().addItems(
                            new MediaGalleryItemBuilder().setURL(media.bannerImage).setDescription(`Banner image of ${title}`)
                        )
                    );
                }

                messageContainer.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

                messageContainer.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        [
                            `**Popularity:** ${media.popularity ?? 'Unknown'}`,
                            `**Score:** ${media.averageScore ?? 'Unknown'}`,
                            `**Favorites:** ${media.favourites ?? 'Unknown'}`
                        ].join('\n')
                    )
                );

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setStyle(ButtonStyle.Link)
                        .setLabel('View on AniList')
                        .setURL(media.siteUrl || 'https://anilist.co')
                );

                await channel.send({
                    flags: MessageFlags.IsComponentsV2,
                    components: [messageContainer, row],
                    allowedMentions: { parse: [] }
                });

                latestActivity = {
                    title,
                    episode: schedule.episode ?? '?'
                };

                container.logger.info(`[AniClient] New episode sent: ${title} #${schedule.episode ?? 'Unknown'} (${this.makeKey(schedule)})`);
            }

            if (results.length > 0) {
                this.lastChecked = maxAiringAtSeen;
                await this.saveLastChecked(this.lastChecked);
            }

            if (latestActivity) {
                await this.saveLastActivity(latestActivity);
                container.client.user?.setActivity({
                    name: `Episode ${latestActivity.episode} of ${latestActivity.title}`,
                    type: ActivityType.Watching
                });
            }
        } catch (error) {
            container.logger.error('[AniClient] Error fetching episodes:', error);
        } finally {
            this.isRunning = false;
            this.scheduleNext();
        }
    }
}