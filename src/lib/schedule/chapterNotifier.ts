import { container } from '@sapphire/framework';
import {
	ContainerBuilder,
	MessageFlags,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	ThumbnailBuilder,
	ButtonBuilder,
	ButtonStyle,
	ActionRowBuilder
} from 'discord.js';
import type { Client, TextChannel, NewsChannel } from 'discord.js';
import { redis } from '../database/redis';
import { listGuildsWithChapterChannel } from '../database/guildSettingsStore';
import AnilistClient from '../aniClient';
import { MediaType } from 'ani-client';

interface MangaDexChapter {
	id: string;
	attributes: {
		chapter: string | null;
		title: string | null;
		translatedLanguage: string;
		publishAt: string;
		externalUrl: string | null;
	};
	relationships: Array<{
		id: string;
		type: string;
		attributes?: {
			title?: Record<string, string>;
			links?: Record<string, string> | null;
		};
	}>;
}

interface MangaDexResponse {
	result: string;
	data: MangaDexChapter[];
}

interface AniListMatch {
	id: number;
	title: string;
	coverImage: string | null;
	color: string | null;
	genres: string[];
	siteUrl: string;
	popularity: number;
}

interface EnrichedChapter {
	chapterId: string;
	chapterNumber: string;
	chapterTitle: string | null;
	publishAt: Date;
	mangaDexId: string;
	mangaTitle: string;
	readUrl: string;
	anilist?: AniListMatch;
}

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const POPULARITY_THRESHOLD = 5000;
const REDIS_LAST_CHECKED = 'lura:manga-notifier:lastChecked';
const REDIS_SENT_PREFIX = 'lura:manga-notifier:sent:';
const REDIS_MDEX_TO_ANI_PREFIX = 'lura:manga-notifier:mdex2ani:';
const SENT_TTL_SECONDS = 60 * 60 * 24 * 7;
const MAP_TTL_SECONDS = 60 * 60 * 24 * 30;
const FETCH_LIMIT = 100;

export class ChapterNotifier {
	private client: Client;
	private timer: NodeJS.Timeout | null = null;
	private isRunning = false;

	constructor(client: Client) {
		this.client = client;
	}

	async start(): Promise<void> {
		if (this.timer) return;
		container.logger.info('[ChapterNotifier] Starting (poll every 5min)');

		const existing = await redis.get(REDIS_LAST_CHECKED);
		if (!existing) {
			await redis.set(REDIS_LAST_CHECKED, new Date().toISOString());
		}

		await this.tick();
		this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
	}

	stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		container.logger.info('[ChapterNotifier] Stopped');
	}

	private async tick(): Promise<void> {
		if (this.isRunning) return;
		this.isRunning = true;
		try {
			const lastCheckedRaw = await redis.get(REDIS_LAST_CHECKED);
			const lastChecked = lastCheckedRaw ? new Date(lastCheckedRaw) : new Date(Date.now() - POLL_INTERVAL_MS);

			const chapters = await this.fetchRecentChapters();
			if (!chapters.length) return;

			const fresh = chapters.filter((c) => new Date(c.attributes.publishAt) > lastChecked);
			if (!fresh.length) return;

			container.logger.info(`[ChapterNotifier] ${fresh.length} new chapter(s) since ${lastChecked.toISOString()}`);

			const enriched: EnrichedChapter[] = [];
			for (const ch of fresh) {
				const e = await this.enrich(ch);
				if (!e) continue;
				if (!e.anilist || e.anilist.popularity < POPULARITY_THRESHOLD) continue;
				enriched.push(e);
			}

			if (!enriched.length) {
				await this.advance(chapters);
				return;
			}

			const guilds = await listGuildsWithChapterChannel();
			if (!guilds.length) {
				await this.advance(chapters);
				return;
			}

			for (const chapter of enriched) {
				await this.dispatchChapter(chapter, guilds);
			}

			await this.advance(chapters);
		} catch (err) {
			container.logger.error('[ChapterNotifier] tick failed:', err);
		} finally {
			this.isRunning = false;
		}
	}

	private async advance(chapters: MangaDexChapter[]): Promise<void> {
		const latest = chapters.reduce<Date>((acc, c) => {
			const d = new Date(c.attributes.publishAt);
			return d > acc ? d : acc;
		}, new Date(0));
		if (latest.getTime() > 0) {
			await redis.set(REDIS_LAST_CHECKED, latest.toISOString());
		}
	}

	private async fetchRecentChapters(): Promise<MangaDexChapter[]> {
		const url = new URL('https://api.mangadex.org/chapter');
		url.searchParams.set('limit', String(FETCH_LIMIT));
		url.searchParams.set('order[publishAt]', 'desc');
		url.searchParams.append('translatedLanguage[]', 'en');
		url.searchParams.append('includes[]', 'manga');
		url.searchParams.append('contentRating[]', 'safe');
		url.searchParams.append('contentRating[]', 'suggestive');

		try {
			const res = await fetch(url.toString(), {
				headers: { 'User-Agent': 'Lura-Bot/1.0 (Discord)' }
			});
			if (!res.ok) {
				container.logger.warn(`[ChapterNotifier] MangaDex fetch failed: ${res.status}`);
				return [];
			}
			const json = (await res.json()) as MangaDexResponse;
			return json.data ?? [];
		} catch (err) {
			container.logger.warn('[ChapterNotifier] MangaDex fetch error:', err);
			return [];
		}
	}

	private async enrich(ch: MangaDexChapter): Promise<EnrichedChapter | null> {
		const mangaRel = ch.relationships.find((r) => r.type === 'manga');
		if (!mangaRel) return null;

		const titles = mangaRel.attributes?.title ?? {};
		const mangaTitle = titles.en ?? titles['ja-ro'] ?? Object.values(titles)[0] ?? 'Unknown';
		const links = mangaRel.attributes?.links ?? null;
		const anilistId = links?.al ?? null;

		const enriched: EnrichedChapter = {
			chapterId: ch.id,
			chapterNumber: ch.attributes.chapter ?? '?',
			chapterTitle: ch.attributes.title,
			publishAt: new Date(ch.attributes.publishAt),
			mangaDexId: mangaRel.id,
			mangaTitle,
			readUrl: ch.attributes.externalUrl ?? `https://mangadex.org/chapter/${ch.id}`
		};

		const ani = await this.resolveAniList(mangaRel.id, mangaTitle, anilistId);

		if (ani) enriched.anilist = ani;

		return enriched;
	}

	private async resolveAniList(mangaDexId: string, mangaTitle: string, anilistId: string | null) {
		const cacheKey = `${REDIS_MDEX_TO_ANI_PREFIX}${mangaDexId}`;
		const cached = await redis.get(cacheKey);
		if (cached) return cached === 'null' ? null : JSON.parse(cached);

		const client = AnilistClient.getInstance().getAniClient();
		let media = null;

		if (anilistId) {
			const res = await client.getMedia(Number(anilistId));
			media = res ?? null;
		}

		if (!media) {
			const res = await client.searchMedia({ query: mangaTitle, type: MediaType.MANGA });
			media = res?.results?.[0] ?? null;
		}

		if (!media || (media.popularity ?? 0) < POPULARITY_THRESHOLD) {
			await redis.setex(cacheKey, MAP_TTL_SECONDS, 'null');
			return null;
		}

		if (!media.status || (media.status !== 'RELEASING' && media.status !== 'HIATUS')) return null;

		const mapped = {
			id: media.id,
			title: media.title?.english ?? media.title?.romaji ?? mangaTitle,
			coverImage: media.coverImage?.large ?? media.coverImage?.medium ?? null,
			color: media.coverImage?.color ?? null,
			genres: media.genres ?? [],
			siteUrl: media.siteUrl ?? null,
			popularity: media.popularity ?? 0
		};

		await redis.setex(cacheKey, MAP_TTL_SECONDS, JSON.stringify(mapped));
		return mapped;
	}

	private async dispatchChapter(chapter: EnrichedChapter, guilds: Array<{ guildId: string; channelId: string }>): Promise<void> {
		const dedupKey = `${REDIS_SENT_PREFIX}${chapter.chapterId}`;
		const claimed = await redis.set(dedupKey, '1', 'EX', SENT_TTL_SECONDS, 'NX');
		if (!claimed) return;

		const channels: Array<{ guildId: string; channel: TextChannel | NewsChannel }> = [];
		for (const g of guilds) {
			try {
				const ch = await this.client.channels.fetch(g.channelId);
				if (ch && 'send' in ch && typeof (ch as any).send === 'function') {
					channels.push({ guildId: g.guildId, channel: ch as TextChannel | NewsChannel });
				}
			} catch {}
		}

		if (!channels.length) {
			await redis.del(dedupKey);
			return;
		}

		const containerComp = this.buildContainer(chapter);

		const results = await Promise.allSettled(
			channels.map((c) =>
				c.channel.send({
					flags: MessageFlags.IsComponentsV2,
					components: [containerComp],
					allowedMentions: { parse: [] }
				})
			)
		);

		const successCount = results.filter((r) => r.status === 'fulfilled').length;
		if (successCount === 0) {
			await redis.del(dedupKey);
			container.logger.warn(`[ChapterNotifier] No successful sends for chapter ${chapter.chapterId}`);
		} else {
			container.logger.info(
				`[ChapterNotifier] Sent "${chapter.mangaTitle}" Ch.${chapter.chapterNumber} → ${successCount}/${channels.length} channels`
			);
		}
	}

	private buildContainer(chapter: EnrichedChapter): ContainerBuilder {
		const ani = chapter.anilist;
		const title = ani?.title ?? chapter.mangaTitle;
		const cover = ani?.coverImage ?? null;
		const colorHex = ani?.color ? this.parseHex(ani.color) : 0xff1a64;

		const containerComp = new ContainerBuilder().setAccentColor(colorHex);

		const header = new TextDisplayBuilder().setContent(`### 📖 New Chapter — ${title}`);
		const body = new TextDisplayBuilder().setContent(
			[
				`**Chapter ${chapter.chapterNumber}**${chapter.chapterTitle ? ` — *${chapter.chapterTitle}*` : ''}`,
				ani?.genres?.length ? `*${ani.genres.slice(0, 3).join(' • ')}*` : null,
				`<t:${Math.floor(chapter.publishAt.getTime() / 1000)}:R>`
			]
				.filter(Boolean)
				.join('\n')
		);

		if (cover) {
			const section = new SectionBuilder().addTextDisplayComponents(header, body).setThumbnailAccessory(new ThumbnailBuilder().setURL(cover));
			containerComp.addSectionComponents(section);
		} else {
			containerComp.addTextDisplayComponents(header, body);
		}

		containerComp.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Read on MangaDex').setURL(chapter.readUrl)
		);
		if (ani?.siteUrl) {
			row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('AniList').setURL(ani.siteUrl));
		}
		containerComp.addActionRowComponents(row);

		return containerComp;
	}

	private parseHex(hex: string): number {
		const clean = hex.replace('#', '');
		const n = Number.parseInt(clean, 16);
		return Number.isFinite(n) ? n : 0xff1a64;
	}
}
