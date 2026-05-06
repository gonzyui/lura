import { container } from '@sapphire/framework';
import Parser from 'rss-parser';
import { redis } from '../database/redis';
import { getNewsChannelId } from '../database/guildSettingsStore';
import { EmbedBuilder, type SendableChannels } from 'discord.js';

const NEWS_FEED_URL = 'https://www.animenewsnetwork.com/all/rss.xml';
const LAST_CHECKED_KEY = 'lura:news-notifier:lastChecked';
const SENT_PREFIX = 'lura:news-notifier:sent:';
const SENT_TTL_SECONDS = 60 * 60 * 24 * 30;

type RSSItem = {
	title?: string;
	link?: string;
	pubDate?: string;
	content?: string;
	contentSnippet?: string;
	guid?: string;
};

export class NewsNotifier {
	private isRunning = false;
	private timeout: NodeJS.Timeout | null = null;
	private parser = new Parser();
	private lastChecked: number = Date.now();

	private readonly pollInterval = 15 * 60 * 1000;

	public start() {
		if (this.timeout || this.isRunning) {
			container.logger.warn('[NewsNotifier] Already running.');
			return;
		}
		void this.loadLastChecked().then(() => this.tick());
	}

	public stop() {
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = null;
		}
		this.isRunning = false;
		container.logger.info('[NewsNotifier] Stopped.');
	}

	private scheduleNext() {
		const jitter = this.pollInterval * (0.9 + Math.random() * 0.2);
		this.timeout = setTimeout(() => {
			this.timeout = null;
			void this.tick();
		}, jitter);
	}

	private makeKey(item: RSSItem): string {
		return item.guid || item.link || item.title || 'unknown';
	}

	private makeSentKey(item: RSSItem): string {
		return `${SENT_PREFIX}${this.makeKey(item)}`;
	}

	private cleanContent(content?: string | null): string {
		let text =
			content
				?.replace(/<[^>]*>/g, '')
				.replace(/\s+/g, ' ')
				.trim() || 'No summary available.';

		if (text.length > 400) {
			text = `${text.slice(0, 397)}...`;
		}
		return text;
	}

	private async loadLastChecked() {
		try {
			const saved = await redis.get(LAST_CHECKED_KEY);
			if (saved) {
				const parsed = Number(saved);
				if (Number.isFinite(parsed) && parsed > 0) {
					this.lastChecked = parsed;
					container.logger.info(`[NewsNotifier] Loaded lastChecked from Redis: ${new Date(this.lastChecked).toISOString()}`);
					return;
				}
			}

			const today = new Date();
			today.setHours(0, 0, 0, 0);
			this.lastChecked = today.getTime();

			await this.saveLastChecked(this.lastChecked);
			container.logger.info(
				`[NewsNotifier] First run: initialized lastChecked to today at 00:00 UTC: ${new Date(this.lastChecked).toISOString()}`
			);
		} catch (err) {
			container.logger.error('[NewsNotifier] Failed to load lastChecked:', err);
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			this.lastChecked = today.getTime();
		}
	}

	private async saveLastChecked(value: number) {
		try {
			await redis.set(LAST_CHECKED_KEY, String(value));
		} catch (err) {
			container.logger.error('[NewsNotifier] Failed to save lastChecked:', err);
		}
	}

	private async tryMarkNewsSent(item: RSSItem): Promise<boolean> {
		try {
			const result = await redis.set(this.makeSentKey(item), '1', 'EX', SENT_TTL_SECONDS, 'NX');
			return result === 'OK';
		} catch (err) {
			container.logger.error('[NewsNotifier] Failed to mark news sent:', err);
			return false;
		}
	}

	private async unmarkNewsSent(item: RSSItem) {
		try {
			await redis.del(this.makeSentKey(item));
		} catch (err) {
			container.logger.error('[NewsNotifier] Failed to unmark news:', err);
		}
	}

	private async getNewsChannel(guildId: string): Promise<SendableChannels | null> {
		const channelId = await getNewsChannelId(guildId);

		if (!channelId) return null;

		const cached = container.client.channels.cache.get(channelId);
		if (cached?.isSendable()) return cached;

		const fetched = await container.client.channels.fetch(channelId).catch(() => null);
		if (!fetched?.isSendable()) {
			container.logger.warn(`[NewsNotifier] News channel ${channelId} not found or not sendable (guild ${guildId}).`);
			return null;
		}
		return fetched;
	}

	private buildMessage(item: RSSItem): EmbedBuilder {
		const title = item.title || 'Untitled News';
		const link = item.link || 'https://www.animenewsnetwork.com';
		const summary = this.cleanContent(item.contentSnippet || item.content);
		const pubDate = item.pubDate ? new Date(item.pubDate).toLocaleDateString() : 'Unknown date';

		const embed = new EmbedBuilder()
			.setTitle(title)
			.setDescription(summary.length > 4096 ? summary.substring(0, 4093) + '...' : summary)
			.setURL(link)
			.setColor(0xff6b6b)
			.setFooter({ text: `Published: ${pubDate}` })
			.setTimestamp(item.pubDate ? new Date(item.pubDate).getTime() : Date.now());

		if (item.content) {
			const imgMatch = item.content.match(/<img[^>]+src=["']([^"']+)["']/);
			if (imgMatch?.[1]) {
				embed.setImage(imgMatch[1]);
			}
		}

		return embed;
	}

	private async tick() {
		if (this.isRunning) {
			container.logger.warn('[NewsNotifier] Tick skipped: previous run still active.');
			return;
		}

		this.isRunning = true;
		container.logger.info('[NewsNotifier] Tick started.');

		try {
			const guildChannels = (
				await Promise.all(
					[...container.client.guilds.cache.values()].map(async (guild) => {
						const channel = await this.getNewsChannel(guild.id);
						return channel ? { guild, channel } : null;
					})
				)
			).filter((entry): entry is { guild: typeof entry extends null ? never : NonNullable<typeof entry>['guild']; channel: SendableChannels } =>
				Boolean(entry)
			);

			if (guildChannels.length === 0) {
				container.logger.warn('[NewsNotifier] No configured news channels found.');
				this.isRunning = false;
				this.scheduleNext();
				return;
			}

			const feed = await this.parser.parseURL(NEWS_FEED_URL);
			const items = (feed.items || [])
				.filter((item) => item.pubDate)
				.sort((a, b) => {
					const aDate = new Date(a.pubDate!).getTime();
					const bDate = new Date(b.pubDate!).getTime();
					return bDate - aDate;
				});

			container.logger.info(`[NewsNotifier] Feed returned ${items.length} items.`);

			let sentCount = 0;
			let maxDate = this.lastChecked;

			for (const item of items) {
				const itemDate = new Date(item.pubDate!).getTime();

				if (itemDate < this.lastChecked) {
					container.logger.debug(`[NewsNotifier] Skipping old item: "${item.title}" (${new Date(itemDate).toISOString()})`);
					continue;
				}

				const wasMarked = await this.tryMarkNewsSent(item);
				if (!wasMarked) {
					container.logger.debug(`[NewsNotifier] Already sent: "${item.title}"`);
					continue;
				}

				const embed = this.buildMessage(item);

				const sendResults = await Promise.allSettled(
					guildChannels.map(({ guild, channel }) =>
						channel
							.send({
								embeds: [embed],
								allowedMentions: { parse: [] }
							})
							.then(() => {
								container.logger.info(`[NewsNotifier] Sent to guild ${guild.id}: ${item.title}`);
								return guild.id;
							})
					)
				);

				const successCount = sendResults.filter((r) => r.status === 'fulfilled').length;

				if (successCount === 0) {
					container.logger.warn(`[NewsNotifier] All guilds failed for "${item.title}". Rolling back.`);
					await this.unmarkNewsSent(item);
					continue;
				}

				sentCount++;
				maxDate = Math.max(maxDate, itemDate);
			}

			if (maxDate > this.lastChecked) {
				this.lastChecked = maxDate;
				await this.saveLastChecked(this.lastChecked);
				container.logger.info(`[NewsNotifier] Updated lastChecked to ${new Date(this.lastChecked).toISOString()}`);
			}

			if (sentCount > 0) {
				container.logger.info(`[NewsNotifier] Sent ${sentCount} news items.`);
			}
		} catch (error) {
			container.logger.error('[NewsNotifier] Error fetching feed:', error);
		} finally {
			this.isRunning = false;
			this.scheduleNext();
		}
	}
}
