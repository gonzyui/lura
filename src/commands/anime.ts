import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import {
	ApplicationCommandOptionType,
	ApplicationIntegrationType,
	ContainerBuilder,
	InteractionContextType,
	MessageFlags,
	SectionBuilder,
	TextDisplayBuilder,
	ThumbnailBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder
} from 'discord.js';
import AnilistClient from '../lib/aniClient';
import { MediaSort, MediaType } from 'ani-client';

@ApplyOptions<Command.Options>({
	description: 'Shows informations about anime.'
})
export class AnimeCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		const integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];
		const contexts: InteractionContextType[] = [InteractionContextType.Guild];

		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
			integrationTypes,
			contexts,
			options: [
				{
					name: 'name',
					description: 'Name of the anime.',
					type: ApplicationCommandOptionType.String,
					required: true
				}
			]
		});
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const name = interaction.options.getString('name', true);

		const search = await AnilistClient.getInstance()
			.getAniClient()
			.searchMedia({
				query: name,
				type: MediaType.ANIME,
				sort: [MediaSort.POPULARITY_DESC]
			});

		const media = search?.results?.[0];

		if (!media) {
			return interaction.reply({
				content: 'No anime found.',
				flags: MessageFlags.Ephemeral
			});
		}

		const stripHtml = (text?: string | null) =>
			text
				?.replace(/<[^>]*>/g, '')
				.replace(/\s+/g, ' ')
				.trim() || '';

		const formatDate = (date?: { year?: number | null; month?: number | null; day?: number | null } | null) => {
			if (!date?.year) return 'Unknown';
			const parts = [date.year, date.month, date.day].filter(Boolean);
			return parts.join('-');
		};

		const title = media.title.romaji || media.title.english || media.title.native || 'Unknown title';

		let description = stripHtml(media.description);
		if (description.length > 700) description = `${description.slice(0, 697)}...`;

		const studios = media.studios?.nodes?.map((studio) => studio.name).join(', ') || 'Unknown';
		const genres = media.genres?.join(', ') || 'Unknown';

		const quickFacts = [
			`**Format:** ${media.format ?? 'Unknown'}`,
			`**Status:** ${media.status ?? 'Unknown'}`,
			`**Episodes:** ${media.episodes ?? 'Unknown'}`,
			`**Source:** ${media.source ?? 'Unknown'}`,
			`**Score:** ${media.averageScore ?? 'Unknown'}`,
			`**Mean Score:** ${media.meanScore ?? 'Unknown'}`,
			`**Popularity:** ${media.popularity ?? 'Unknown'}`,
			`**Favorites:** ${media.favourites ?? 'Unknown'}`,
			`**Start Date:** ${formatDate(media.startDate)}`,
			`**End Date:** ${formatDate(media.endDate)}`,
			`**Genres:** ${genres}`,
			`**Studios:** ${studios}`,
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
							media.season && media.seasonYear ? `**${media.season} ${media.seasonYear}**` : null,
							description || '*No description available.*'
						]
							.filter(Boolean)
							.join('\n\n')
					)
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

		return interaction.reply({
			flags: MessageFlags.IsComponentsV2,
			components: [container],
			allowedMentions: { parse: [] }
		});
	}
}
