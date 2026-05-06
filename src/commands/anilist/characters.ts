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
import { CharacterSort } from 'ani-client';
import { stripHtml, formatDate, truncate } from '../../lib/utils/formatters';

@ApplyOptions<Command.Options>({
	description: 'Shows informations about a character.',
	requiredClientPermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles],
	cooldownDelay: 3000,
	cooldownLimit: 1
})
export class CharactersCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
			integrationTypes: [ApplicationIntegrationType.GuildInstall],
			contexts: [InteractionContextType.Guild],
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
		await interaction.deferReply();

		const name = interaction.options.getString('name', true);

		const search = await AnilistClient.getInstance()
			.getAniClient()
			.searchCharacters({
				query: name,
				sort: [CharacterSort.FAVOURITES_DESC]
			});

		const character = search?.results?.[0];

		if (!character) {
			return interaction.editReply({ content: '> No character found.' });
		}

		const characterName =
			[character.name?.full, [character.name?.first, character.name?.last].filter(Boolean).join(' ').trim(), character.name?.native].find(
				Boolean
			) || 'Unknown character';

		const description = truncate(stripHtml(character.description), 700);
		const mediaPreview = character.media?.nodes?.slice(0, 4) || [];

		const featuredIn =
			mediaPreview
				.map((m) => m.title?.romaji || m.title?.english || m.title?.native)
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
			.filter((m) => m.coverImage?.extraLarge || m.coverImage?.large)
			.map((m) =>
				new MediaGalleryItemBuilder()
					.setURL(m.coverImage?.extraLarge || m.coverImage?.large || '')
					.setDescription(`${characterName} appears in ${m.title?.romaji || m.title?.english || m.title?.native || 'this media'}`)
			);

		if (galleryItems.length > 0) {
			container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
			container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(galleryItems));
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
