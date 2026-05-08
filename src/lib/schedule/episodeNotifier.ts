import { container } from '@sapphire/framework';
import AnilistClient from '../aniClient';
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
	ThumbnailBuilder,
	type Guild,
	type SendableChannels
} from 'discord.js';
import { redis } from '../database/redis';
import { getAiringChannelId } from '../database/guildSettingsStore';

const LAST_CHECKED_KEY = 'lura:episode-notifier:lastChecked';
const LAST_ACTIVITY_KEY = 'lura:episode-notifier:lastActivity';
const SENT_PREFIX = 'lura:episode-notifier:sent:';
const SENT_TTL_SECONDS = 60 * 60 * 24 * 7;

type LastActivityPayload = {
	title: string;
	episode: number | string;
};

type AiredSchedule = {
	id?: number;
	airingAt: number;
	episode?: number;
	media?: {
		id?: number;
		title?: { english?: string; romaji?: string; native?: string };
		coverImage?: { extraLarge?: string; large?: string; medium?: string };
		bannerImage?: string;
		description?: string;
		genres?: string[];
		format?: string;
		status?: string;
		episodes?: number;
		duration?: number;
		popularity?: number;
		averageScore?: number;
		favourites?: number;
		siteUrl?: string;
	};
};

type GuildChannel = { guild: Guild; channel: SendableChannels };

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
		this.isRunning = true;
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
		const jitter = this.pollInterval * (0.9 + Math.random() * 0.2);
		this.timeout = setTimeout(() => {
			this.timeout = null;
			void this.tick();
		}, jitter);
	}

	private makeKey(schedule: AiredSchedule) {
		return `${schedule.id ?? `${schedule.media?.id}:${schedule.episode}:${schedule.airingAt}`}`;
	}

	private makeSentKey(schedule: AiredSchedule) {
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
			const [savedLastChecked, savedActivity] = await redis.mget(LAST_CHECKED_KEY, LAST_ACTIVITY_KEY);

			if (savedLastChecked) {
				const parsed = Number(savedLastChecked);
				if (Number.isFinite(parsed) && parsed > 0) {
					this.lastChecked = parsed;
				}
			}

			if (savedActivity) {
				try {
					const parsed = JSON.parse(savedActivity) as LastActivityPayload;
					if (parsed?.title) {
						container.client.user?.setActivity({
							name: `Episode ${parsed.episode ?? '?'} of ${parsed.title}`,
							type: ActivityType.Watching
						});
					}
				} catch (e) {
					container.logger.warn('[AniClient] Failed to parse last activity payload.');
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

	private async batchMarkSent(schedules: AiredSchedule[]): Promise<Set<string>> {
		if (schedules.length === 0) return new Set();

		const pipeline = redis.pipeline();
		for (const s of schedules) {
			pipeline.set(this.makeSentKey(s), '1', 'EX', SENT_TTL_SECONDS, 'NX');
		}
		const results = await pipeline.exec();
		const newlyMarked = new Set<string>();

		if (!results) return newlyMarked;

		for (let i = 0; i < results.length; i++) {
			const [err, value] = results[i];
			if (!err && value === 'OK') {
				newlyMarked.add(this.makeKey(schedules[i]));
			}
		}
		return newlyMarked;
	}

	private async unmarkEpisodeSent(schedule: AiredSchedule) {
		await redis.del(this.makeSentKey(schedule));
	}

	private async resolveGuildChannels(): Promise<GuildChannel[]> {
		const guilds = [...container.client.guilds.cache.values()];

		const entries = await Promise.all(
			guilds.map(async (guild) => {
				try {
					const channelId = await getAiringChannelId(guild.id);
					if (!channelId) return null;

					const cached = container.client.channels.cache.get(channelId);
					if (cached?.isSendable()) return { guild, channel: cached as SendableChannels };

					const fetched = await container.client.channels.fetch(channelId).catch(() => null);
					if (fetched?.isSendable()) return { guild, channel: fetched as SendableChannels };

					return null;
				} catch (err) {
					container.logger.error(`[AniClient] Failed to resolve channel for guild ${guild.id}:`, err);
					return null;
				}
			})
		);

		return entries.filter((e): e is GuildChannel => e !== null);
	}

	private buildMessage(schedule: AiredSchedule) {
		const media = schedule.media!;
		const title = media.title?.english || media.title?.romaji || media.title?.native || 'Unknown title';
		const cover = media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium;
		const banner = media.bannerImage;
		const description = this.cleanDescription(media.description);

		const messageContainer = new ContainerBuilder().setAccentColor(0x9b59ff);

		messageContainer.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`# 📺 New Episode Aired!\n## ${title} — Episode ${schedule.episode ?? '?'}`)
		);

		if (banner) {
			messageContainer.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(banner)));
		}

		messageContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

		const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(description));

		if (cover) {
			section.setThumbnailAccessory(new ThumbnailBuilder().setURL(cover));
		}
		messageContainer.addSectionComponents(section);

		messageContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

		messageContainer.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				[
					`**Format:** ${media.format ?? 'Unknown'}`,
					`**Status:** ${media.status ?? 'Unknown'}`,
					`**Episodes:** ${media.episodes ?? 'Unknown'}`,
					`**Duration:** ${media.duration ? `${media.duration} min` : 'Unknown'}`,
					`**Genres:** ${media.genres?.join(', ') || 'Unknown'}`,
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

		return { title, components: [messageContainer, row] };
	}

	private async tick() {
		if (this.isRunning) {
			container.logger.warn('[AniClient] Tick skipped: previous run still active.');
			return;
		}

		this.isRunning = true;

		try {
			await this.loadState();

			const notif = await AnilistClient.getInstance()
				.getAniClient()
				.getAiredEpisodes({
					airingAtGreater: Math.max(0, this.lastChecked - this.safetyMargin),
					sort: [AiringSort.TIME],
					perPage: 50
				});

			const results = ((notif.results ?? []) as AiredSchedule[])
				.filter((s) => {
					if (!s?.airingAt) return false;
					if (!s.media) {
						container.logger.warn(`[AniClient] Schedule ${s.id} missing media, skipping.`);
						return false;
					}
					return true;
				})
				.sort((a, b) => a.airingAt - b.airingAt);

			if (results.length === 0) {
				return;
			}

			const sample = results
				.slice(0, 5)
				.map((r) => r.media?.title?.english || r.media?.title?.romaji || r.media?.title?.native)
				.join(', ');
			container.logger.info(
				`[AniClient] API returned ${results.length} results: ${sample}${results.length > 5 ? `, ... and ${results.length - 5} more` : ''}`
			);

			const newlyMarked = await this.batchMarkSent(results);
			const toSend = results.filter((s) => newlyMarked.has(this.makeKey(s)));

			let maxAiringAtSeen = results.reduce((max, s) => Math.max(max, s.airingAt ?? 0), this.lastChecked);

			if (toSend.length === 0) {
				if (maxAiringAtSeen > this.lastChecked) {
					this.lastChecked = maxAiringAtSeen;
					await this.saveLastChecked(this.lastChecked);
				}
				return;
			}

			const guildChannels = await this.resolveGuildChannels();

			if (guildChannels.length === 0) {
				container.logger.warn('[AniClient] Nothing to send: no configured airing channels.');
				await Promise.all(toSend.map((s) => this.unmarkEpisodeSent(s)));
				return;
			}

			let latestActivity: LastActivityPayload | null = null;

			for (const schedule of toSend) {
				const { title, components } = this.buildMessage(schedule);

				const sendResults = await Promise.allSettled(
					guildChannels.map(({ guild, channel }) =>
						channel
							.send({
								flags: MessageFlags.IsComponentsV2,
								components,
								allowedMentions: { parse: [] }
							})
							.then(() => guild.id)
					)
				);

				const successCount = sendResults.filter((r) => r.status === 'fulfilled').length;

				for (const r of sendResults) {
					if (r.status === 'rejected') {
						container.logger.error(`[AniClient] Failed to send "${title}":`, r.reason);
					}
				}

				if (successCount === 0) {
					container.logger.warn(`[AniClient] All guilds failed for "${title}" #${schedule.episode}. Rolling back.`);
					await this.unmarkEpisodeSent(schedule);
					continue;
				}

				container.logger.info(
					`[AniClient] Episode "${title}" #${schedule.episode ?? '?'} sent to ${successCount}/${guildChannels.length} guilds.`
				);

				latestActivity = {
					title,
					episode: schedule.episode ?? '?'
				};
			}

			if (maxAiringAtSeen > this.lastChecked) {
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
			container.logger.error('[AniClient] Error in tick:', error);
		} finally {
			this.isRunning = false;
			this.scheduleNext();
		}
	}
}
