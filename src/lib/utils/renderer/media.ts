import {
	ContainerBuilder,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	ThumbnailBuilder
} from 'discord.js';
import { MediaType } from 'ani-client';
import { stripHtml, formatDate, truncate } from '../formatters';

export function buildMediaContainer(media: any, type: MediaType): ContainerBuilder {
	const title = media.title.romaji || media.title.english || media.title.native || 'Unknown title';
	const description = truncate(stripHtml(media.description), 700);
	const genres = media.genres?.join(', ') || 'Unknown';
	const studios = media.studios?.nodes?.map((s: any) => s.name).join(', ') || 'Unknown';

	const isAnime = type === MediaType.ANIME;

	const quickFacts = [
		`**Format:** ${media.format ?? 'Unknown'}`,
		`**Status:** ${media.status ?? 'Unknown'}`,
		isAnime ? `**Episodes:** ${media.episodes ?? 'Unknown'}` : null,
		!isAnime ? `**Chapters:** ${media.chapters ?? 'Unknown'}` : null,
		!isAnime ? `**Volumes:** ${media.volumes ?? 'Unknown'}` : null,
		`**Source:** ${media.source ?? 'Unknown'}`,
		`**Score:** ${media.averageScore ?? 'Unknown'}`,
		`**Mean Score:** ${media.meanScore ?? 'Unknown'}`,
		`**Popularity:** ${media.popularity ?? 'Unknown'}`,
		`**Favorites:** ${media.favourites ?? 'Unknown'}`,
		`**Start Date:** ${formatDate(media.startDate)}`,
		`**End Date:** ${formatDate(media.endDate)}`,
		`**Genres:** ${genres}`,
		isAnime ? `**Studios:** ${studios}` : null,
		media.siteUrl ? `**AniList:** ${media.siteUrl}` : null
	]
		.filter(Boolean)
		.join('\n');

	const container = new ContainerBuilder().setAccentColor(0xff1a64);

	container.addSectionComponents(
		new SectionBuilder()
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`# ${title}`),
				new TextDisplayBuilder().setContent(
					[
						isAnime && media.season && media.seasonYear ? `**${media.season} ${media.seasonYear}**` : null,
						description || '*No description available.*'
					]
						.filter(Boolean)
						.join('\n\n')
				)
			)
			.setThumbnailAccessory(
				new ThumbnailBuilder().setURL(media.coverImage?.extraLarge || media.coverImage?.large || '').setDescription(`Cover image of ${title}`)
			)
	);

	if (media.bannerImage) {
		container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
		container.addMediaGalleryComponents(
			new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(media.bannerImage).setDescription(`Banner image of ${title}`))
		);
	}

	container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(quickFacts));

	return container;
}

const PAGE_SIZE = 5;

export function buildMediaListContainer(list: any[], type: MediaType, title: string, page = 0): { container: ContainerBuilder; totalPages: number } {
	const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
	const safePage = Math.min(Math.max(0, page), totalPages - 1);
	const slice = list.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

	const container = new ContainerBuilder().setAccentColor(0xff1a64);
	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}\n-# Page ${safePage + 1} / ${totalPages}`));
	container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

	for (const media of slice) {
		const t = media.title.romaji || media.title.english || media.title.native || 'Unknown';
		const score = media.averageScore ? `⭐ ${media.averageScore}` : '—';
		const fmt = media.format ?? 'Unknown';
		const ep = type === MediaType.ANIME ? `${media.episodes ?? '?'} ep` : `${media.chapters ?? '?'} ch`;

		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(`### ${t}`),
					new TextDisplayBuilder().setContent(`${score} • **${fmt}** • ${ep}\n${media.siteUrl ? `[AniList](${media.siteUrl})` : ''}`)
				)
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(media.coverImage?.large || media.coverImage?.extraLarge || '').setDescription(`Cover of ${t}`)
				)
		);
	}

	return { container, totalPages };
}
