import { container } from '@sapphire/framework';
import Parser from 'rss-parser';
import { redis } from '../database/redis';
import { getNewsChannelId } from '../database/guildSettingsStore';
import { EmbedBuilder, type Guild, type SendableChannels } from 'discord.js';

const NEWS_FEED_URL = 'https://www.animenewsnetwork.com/all/rss.xml';
const LAST_CHECKED_KEY = 'lura:news-notifier:lastChecked';
const ETAG_KEY = 'lura:news-notifier:etag';
const LAST_MODIFIED_KEY = 'lura:news-notifier:lastModified';
const SENT_PREFIX = 'lura:news-notifier:sent:';
const SENT_TTL_SECONDS = 60 * 60 * 24 * 7;

type RSSItem = {
	title?: string;
	link?: string;
	pubDate?: string;
	content?: string;
	contentSnippet?: string;
	guid?: string;
};

type GuildChannel = { guild: Guild; channel: SendableChannels };

export class NewsNotifier {
	private isRunning = false;
	private timeout: NodeJS.Timeout | null = null;
	private parser = new Parser();
	private lastChecked: number = Date.now();
	private hasLoadedState = false;

	private etag: string | null = null;
	private lastModified: string | null = null;

	private readonly pollInterval = 15 * 60 * 1000;

	public start() {
		if (this.timeout || this.isRunning) {
			container.logger.warn('[NewsNotifier] Already running.');
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

	private async loadState() {
		if (this.hasLoadedState) return;

		try {
			const [savedLastChecked, savedEtag, savedLastModified] = await redis.mget(LAST_CHECKED_KEY, ETAG_KEY, LAST_MODIFIED_KEY);

			if (savedLastChecked) {
				const parsed = Number(savedLastChecked);
				if (Number.isFinite(parsed) && parsed > 0) {
					this.lastChecked = parsed;
					container.logger.info(`[NewsNotifier] Loaded lastChecked: ${new Date(this.lastChecked).toISOString()}`);
				}
			} else {
				const today = new Date();
				today.setHours(0, 0, 0, 0);
				this.lastChecked = today.getTime();
				await this.saveLastChecked(this.lastChecked);
				container.logger.info(`[NewsNotifier] First run: initialized to ${new Date(this.lastChecked).toISOString()}`);
			}

			this.etag = savedEtag;
			this.lastModified = savedLastModified;
			this.hasLoadedState = true;
		} catch (err) {
			container.logger.error('[NewsNotifier] Failed to load state:', err);
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

	private async saveCacheHeaders(etag: string | null, lastModified: string | null) {
		try {
			const pipeline = redis.pipeline();
			if (etag) pipeline.set(ETAG_KEY, etag);
			else pipeline.del(ETAG_KEY);
			if (lastModified) pipeline.set(LAST_MODIFIED_KEY, lastModified);
			else pipeline.del(LAST_MODIFIED_KEY);
			await pipeline.exec();
		} catch (err) {
			container.logger.error('[NewsNotifier] Failed to save cache headers:', err);
		}
	}

	private async batchMarkSent(items: RSSItem[]): Promise<Set<string>> {
		if (items.length === 0) return new Set();

		const pipeline = redis.pipeline();
		for (const item of items) {
			pipeline.set(this.makeSentKey(item), '1', 'EX', SENT_TTL_SECONDS, 'NX');
		}
		const results = await pipeline.exec();
		const newlyMarked = new Set<string>();

		if (!results) return newlyMarked;

		for (let i = 0; i < results.length; i++) {
			const [err, value] = results[i];
			if (!err && value === 'OK') {
				newlyMarked.add(this.makeKey(items[i]));
			}
		}
		return newlyMarked;
	}

	private async unmarkNewsSent(item: RSSItem) {
		try {
			await redis.del(this.makeSentKey(item));
		} catch (err) {
			container.logger.error('[NewsNotifier] Failed to unmark:', err);
		}
	}

	private async resolveGuildChannels(): Promise<GuildChannel[]> {
		const guilds = [...container.client.guilds.cache.values()];

		const entries = await Promise.all(
			guilds.map(async (guild) => {
				try {
					const channelId = await getNewsChannelId(guild.id);
					if (!channelId) return null;

					const cached = container.client.channels.cache.get(channelId);
					if (cached?.isSendable()) return { guild, channel: cached as SendableChannels };

					const fetched = await container.client.channels.fetch(channelId).catch(() => null);
					if (fetched?.isSendable()) return { guild, channel: fetched as SendableChannels };

					container.logger.warn(`[NewsNotifier] Channel ${channelId} not sendable (guild ${guild.id}).`);
					return null;
				} catch (err) {
					container.logger.error(`[NewsNotifier] Failed to resolve channel for guild ${guild.id}:`, err);
					return null;
				}
			})
		);

		return entries.filter((e): e is GuildChannel => e !== null);
	}

	private async fetchFeed(): Promise<{ items: RSSItem[]; etag: string | null; lastModified: string | null } | null> {
		const headers: Record<string, string> = {
			'User-Agent': 'Lura-Bot/1.0 (Discord notifier)'
		};
		if (this.etag) headers['If-None-Match'] = this.etag;
		if (this.lastModified) headers['If-Modified-Since'] = this.lastModified;

		const response = await fetch(NEWS_FEED_URL, { headers });

		if (response.status === 304) {
			container.logger.info('[NewsNotifier] Feed not modified (304).');
			return null;
		}

		if (!response.ok) {
			throw new Error(`Feed fetch failed: ${response.status} ${response.statusText}`);
		}

		const xml = await response.text();
		const feed = await this.parser.parseString(xml);

		return {
			items: (feed.items || []) as RSSItem[],
			etag: response.headers.get('etag'),
			lastModified: response.headers.get('last-modified')
		};
	}

	private buildMessage(item: RSSItem): EmbedBuilder {
		const title = item.title || 'Untitled News';
		const link = item.link || 'https://www.animenewsnetwork.com';
		const summary = this.cleanContent(item.contentSnippet || item.content);
		const pubDate = item.pubDate ? new Date(item.pubDate).toLocaleDateString() : 'Unknown date';

		const embed = new EmbedBuilder()
			.setTitle(title.length > 256 ? title.slice(0, 253) + '...' : title)
			.setDescription(summary)
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
			await this.loadState();

			const feedResult = await this.fetchFeed();
			if (!feedResult) {
				return;
			}

			const { items: rawItems, etag, lastModified } = feedResult;

			if (etag !== this.etag || lastModified !== this.lastModified) {
				this.etag = etag;
				this.lastModified = lastModified;
				await this.saveCacheHeaders(etag, lastModified);
			}

			const items = rawItems
				.filter((item) => item.pubDate)
				.map((item) => ({ item, date: new Date(item.pubDate!).getTime() }))
				.filter(({ date }) => date >= this.lastChecked)
				.sort((a, b) => a.date - b.date)
				.map(({ item }) => item);

			container.logger.info(`[NewsNotifier] Feed: ${rawItems.length} items, ${items.length} new since last check.`);

			if (items.length === 0) {
				return;
			}

			const newlyMarked = await this.batchMarkSent(items);
			const toSend = items.filter((item) => newlyMarked.has(this.makeKey(item)));

			let maxDate = items.reduce((max, item) => Math.max(max, new Date(item.pubDate!).getTime()), this.lastChecked);

			if (toSend.length === 0) {
				if (maxDate > this.lastChecked) {
					this.lastChecked = maxDate;
					await this.saveLastChecked(this.lastChecked);
				}
				return;
			}

			const guildChannels = await this.resolveGuildChannels();

			if (guildChannels.length === 0) {
				container.logger.warn('[NewsNotifier] No configured channels. Rolling back marks.');
				await Promise.all(toSend.map((item) => this.unmarkNewsSent(item)));
				return;
			}

			let sentCount = 0;

			for (const item of toSend) {
				const embed = this.buildMessage(item);
				const itemDate = new Date(item.pubDate!).getTime();

				const sendResults = await Promise.allSettled(
					guildChannels.map(({ guild, channel }) =>
						channel
							.send({
								embeds: [embed],
								allowedMentions: { parse: [] }
							})
							.then(() => guild.id)
					)
				);

				const successCount = sendResults.filter((r) => r.status === 'fulfilled').length;

				for (const r of sendResults) {
					if (r.status === 'rejected') {
						container.logger.error(`[NewsNotifier] Failed to send "${item.title}":`, r.reason);
					}
				}

				if (successCount === 0) {
					container.logger.warn(`[NewsNotifier] All guilds failed for "${item.title}". Rolling back.`);
					await this.unmarkNewsSent(item);
					continue;
				}

				container.logger.info(`[NewsNotifier] "${item.title}" sent to ${successCount}/${guildChannels.length} guilds.`);

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
			container.logger.error('[NewsNotifier] Error in tick:', error);
		} finally {
			this.isRunning = false;
			this.scheduleNext();
		}
	}
}
