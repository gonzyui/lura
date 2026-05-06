import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import {
	ApplicationCommandOptionType,
	ApplicationIntegrationType,
	ContainerBuilder,
	InteractionContextType,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	MessageFlags,
	PermissionFlagsBits,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	ThumbnailBuilder
} from 'discord.js';
import AnilistClient from '../../lib/aniClient';
import { MediaSort, MediaType } from 'ani-client';
import { stripHtml, formatDate, truncate } from '../../lib/utils/formatters';

@ApplyOptions<Command.Options>({
	description: 'Shows informations about manga.',
	requiredClientPermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles],
	cooldownDelay: 3000,
	cooldownLimit: 1
})
export class MangaCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
			integrationTypes: [ApplicationIntegrationType.GuildInstall],
			contexts: [InteractionContextType.Guild],
			options: [
				{
					name: 'name',
					description: 'Name of the manga.',
					type: ApplicationCommandOptionType.String,
					required: true
				}
			]
		});
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply();

		const name = interaction.options.getString('name', true);

		const search = await AnilistClient.getInstance()
			.getAniClient()
			.searchMedia({
				query: name,
				type: MediaType.MANGA,
				sort: [MediaSort.POPULARITY_DESC]
			});

		const media = search?.results?.[0];

		if (!media) {
			return interaction.editReply({ content: '> No manga found.' });
		}

		const title = media.title.romaji || media.title.english || media.title.native || 'Unknown title';
		const description = truncate(stripHtml(media.description), 700);
		const genres = media.genres?.join(', ') || 'Unknown';

		const quickFacts = [
			`**Format:** ${media.format ?? 'Unknown'}`,
			`**Status:** ${media.status ?? 'Unknown'}`,
			`**Chapters:** ${media.chapters ?? 'Unknown'}`,
			`**Volumes:** ${media.volumes ?? 'Unknown'}`,
			`**Source:** ${media.source ?? 'Unknown'}`,
			`**Score:** ${media.averageScore ?? 'Unknown'}`,
			`**Mean Score:** ${media.meanScore ?? 'Unknown'}`,
			`**Popularity:** ${media.popularity ?? 'Unknown'}`,
			`**Favorites:** ${media.favourites ?? 'Unknown'}`,
			`**Start Date:** ${formatDate(media.startDate)}`,
			`**End Date:** ${formatDate(media.endDate)}`,
			`**Genres:** ${genres}`,
			media.siteUrl ? `**AniList:** ${media.siteUrl}` : null
		]
			.filter(Boolean)
			.join('\n');

		const container = new ContainerBuilder().setAccentColor(0xff1a64);

		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(`# ${title}`),
					new TextDisplayBuilder().setContent(description || '*No description available.*')
				)
				.setThumbnailAccessory(
					new ThumbnailBuilder()
						.setURL(media.coverImage?.extraLarge || media.coverImage?.large || '')
						.setDescription(`Cover image of ${title}`)
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

		return interaction.editReply({
			flags: MessageFlags.IsComponentsV2,
			components: [container],
			allowedMentions: { parse: [] }
		});
	}
}
