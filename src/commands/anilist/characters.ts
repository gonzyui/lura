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
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	ThumbnailBuilder
} from 'discord.js';
import AnilistClient from '../../lib/aniClient';
import { CharacterSort } from 'ani-client';

@ApplyOptions<Command.Options>({
	description: 'Shows informations about a character.'
})
export class CharactersCommand extends Command {
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
					description: 'Name of the character.',
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
			.searchCharacters({
				query: name,
				sort: [CharacterSort.FAVOURITES_DESC]
			});

		const character = search?.results?.[0];

		if (!character) {
			return interaction.reply({
				content: '> No character found.',
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

		const characterName =
			[character.name?.full, [character.name?.first, character.name?.last].filter(Boolean).join(' ').trim(), character.name?.native].find(
				Boolean
			) || 'Unknown character';

		let description = stripHtml(character.description);
		if (description.length > 700) description = `${description.slice(0, 697)}...`;

		const mediaPreview = character.media?.nodes?.slice(0, 4) || [];
		const featuredIn =
			mediaPreview
				.map((media) => media.title?.romaji || media.title?.english || media.title?.native)
				.filter(Boolean)
				.join(', ') || 'Unknown';

		const quickFacts = [
			`**Gender:** ${character.gender ?? 'Unknown'}`,
			`**Age:** ${character.age ?? 'Unknown'}`,
			`**Birthday:** ${formatDate(character.dateOfBirth)}`,
			`**Favorites:** ${character.favourites ?? 'Unknown'}`,
			`**Featured in:** ${featuredIn}`,
			character.siteUrl ? `**AniList:** ${character.siteUrl}` : null
		]
			.filter(Boolean)
			.join('\n');

		const container = new ContainerBuilder().setAccentColor(0xff1a64);

		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(`# ${characterName}`),
					new TextDisplayBuilder().setContent(description || '*No description available.*')
				)
				.setThumbnailAccessory(
					new ThumbnailBuilder()
						.setURL(character.image?.large || character.image?.medium || '')
						.setDescription(`Portrait of ${characterName}`)
				)
		);

		const galleryItems = mediaPreview
			.filter((media) => media.coverImage?.extraLarge || media.coverImage?.large)
			.map((media) =>
				new MediaGalleryItemBuilder()
					.setURL(media.coverImage?.extraLarge || media.coverImage?.large || '')
					.setDescription(
						`${characterName} appears in ${media.title?.romaji || media.title?.english || media.title?.native || 'this media'}`
					)
			);

		if (galleryItems.length > 0) {
			container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

			container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(galleryItems));
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
