import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	SectionBuilder,
	SeparatorBuilder,
	TextDisplayBuilder
} from 'discord.js';

export function buildStudioContainer(studio: any): ContainerBuilder {
	const container = new ContainerBuilder();

	const section = new SectionBuilder();
	section.addTextDisplayComponents(
		new TextDisplayBuilder().setContent(
			`# [${studio.name}](${studio.siteUrl})\n` +
				`${studio.isAnimationStudio ? '🎬 Animation Studio' : '📁 Studio'}` +
				`${studio.favourites ? ` • ❤️ ${studio.favourites.toLocaleString()} favourites` : ''}`
		)
	);
	container.addSectionComponents(section);
	container.addSeparatorComponents(new SeparatorBuilder());

	const nodes: any[] = studio.media?.nodes ?? [];
	const unique = nodes.filter((n: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.id === n.id) === i);

	if (unique.length) {
		const total = studio.media?.pageInfo?.total ?? unique.length;
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Productions (${total} total)`));

		const lines = unique.slice(0, 15).map((m: any) => {
			const title = m.title.english ?? m.title.romaji;
			const format = m.format ? ` • ${m.format.replace('_', ' ')}` : '';
			return `• [${title}](${m.siteUrl})${format}`;
		});

		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

		const withCovers = unique.filter((m: any) => m.coverImage?.large).slice(0, 6);
		if (withCovers.length >= 2) {
			container.addSeparatorComponents(new SeparatorBuilder());
			const gallery = new MediaGalleryBuilder();
			for (const m of withCovers) {
				gallery.addItems(new MediaGalleryItemBuilder().setURL(m.coverImage.large).setDescription(m.title.english ?? m.title.romaji));
			}
			container.addMediaGalleryComponents(gallery);
		}
	}

	container.addSeparatorComponents(new SeparatorBuilder());

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setLabel('View on AniList').setURL(studio.siteUrl).setStyle(ButtonStyle.Link)
	);
	container.addActionRowComponents(row);

	return container;
}

export function buildStudioListContainer(studios: any[], title: string): ContainerBuilder {
	const container = new ContainerBuilder();

	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`));
	container.addSeparatorComponents(new SeparatorBuilder());

	const lines = studios.slice(0, 15).map((s: any, i: number) => {
		const type = s.isAnimationStudio ? '🎬' : '📁';
		const fav = s.favourites ? ` • ❤️ ${s.favourites.toLocaleString()}` : '';
		const count = s.media?.pageInfo?.total ? ` • ${s.media.pageInfo.total} works` : '';
		return `**${i + 1}.** ${type} [${s.name}](${s.siteUrl})${count}${fav}`;
	});

	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

	return container;
}
