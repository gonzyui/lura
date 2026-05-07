import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	SectionBuilder,
	SeparatorBuilder,
	TextDisplayBuilder,
	ThumbnailBuilder
} from 'discord.js';
import { formatDate, stripMarkdown } from '../formatters';

export function buildStaffContainer(staff: any): ContainerBuilder {
	const container = new ContainerBuilder();

	const section = new SectionBuilder();
	const occupations = staff.primaryOccupations?.join(', ') || 'Staff';
	section.addTextDisplayComponents(
		new TextDisplayBuilder().setContent(
			`# [${staff.name.full}](${staff.siteUrl})\n` + `**${occupations}**${staff.name.native ? ` • ${staff.name.native}` : ''}`
		)
	);
	if (staff.image?.large) {
		section.setThumbnailAccessory(new ThumbnailBuilder().setURL(staff.image.large));
	}
	container.addSectionComponents(section);
	container.addSeparatorComponents(new SeparatorBuilder());

	const facts: string[] = [];
	if (staff.language) facts.push(`🗣️ **Language:** ${staff.language.charAt(0) + staff.language.slice(1).toLowerCase()}`);
	if (staff.homeTown) facts.push(`📍 **Hometown:** ${staff.homeTown}`);
	if (staff.dateOfBirth) facts.push(`🎂 **Birthday:** ${formatDate(staff.dateOfBirth)}`);
	if (staff.age) facts.push(`📅 **Age:** ${staff.age}`);
	if (staff.yearsActive?.length) facts.push(`⏳ **Active since:** ${staff.yearsActive[0]}`);
	if (staff.favourites) facts.push(`❤️ **Favourites:** ${staff.favourites.toLocaleString()}`);

	if (facts.length) {
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(facts.join('\n')));
		container.addSeparatorComponents(new SeparatorBuilder());
	}

	if (staff.description) {
		const bio = stripMarkdown(staff.description).slice(0, 500);
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### About\n${bio}${staff.description.length > 500 ? '…' : ''}`));
		container.addSeparatorComponents(new SeparatorBuilder());
	}

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setLabel('View on AniList').setURL(staff.siteUrl).setStyle(ButtonStyle.Link)
	);
	container.addActionRowComponents(row);

	return container;
}

export function buildStaffListContainer(staffList: any[], title: string): ContainerBuilder {
	const container = new ContainerBuilder();

	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`));
	container.addSeparatorComponents(new SeparatorBuilder());

	const lines = staffList.slice(0, 15).map((s: any, i: number) => {
		const occ = s.primaryOccupations?.[0] ?? 'Staff';
		const fav = s.favourites ? ` • ❤️ ${s.favourites.toLocaleString()}` : '';
		return `**${i + 1}.** [${s.name.full}](${s.siteUrl}) — ${occ}${fav}`;
	});

	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

	const withImages = staffList.filter((s: any) => s.image?.large).slice(0, 6);
	if (withImages.length >= 2) {
		container.addSeparatorComponents(new SeparatorBuilder());
		const gallery = new MediaGalleryBuilder();
		for (const s of withImages) {
			gallery.addItems(new MediaGalleryItemBuilder().setURL(s.image.large).setDescription(s.name.full));
		}
		container.addMediaGalleryComponents(gallery);
	}

	return container;
}
