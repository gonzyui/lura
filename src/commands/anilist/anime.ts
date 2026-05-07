import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationCommandOptionType, ApplicationIntegrationType, InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import AnilistClient from '../../lib/aniClient';
import { MediaSort, MediaStatus, MediaType } from 'ani-client';
import { buildMediaContainer } from '../../lib/utils/renderer/media';
import { paginateMediaList } from '../../lib/utils/paginator';
import { autocompleteMedia } from '../../lib/utils/autocomplete/media';

const SPECIALS = [
	{ name: '🔥 Trending', value: 'trending' },
	{ name: '📺 Currently Airing', value: 'airing' }
];

@ApplyOptions<Command.Options>({
	description: 'Search an anime, or browse trending / airing.',
	requiredClientPermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles],
	cooldownDelay: 3000,
	cooldownLimit: 1
})
export class AnimeCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
			integrationTypes: [ApplicationIntegrationType.GuildInstall],
			contexts: [InteractionContextType.Guild],
			options: [
				{
					name: 'query',
					description: 'Anime name, or "trending" / "airing".',
					type: ApplicationCommandOptionType.String,
					required: true,
					autocomplete: true
				}
			]
		});
	}

	public override autocompleteRun(interaction: Command.AutocompleteInteraction) {
		return autocompleteMedia(interaction, MediaType.ANIME, SPECIALS);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply();

		const query = interaction.options.getString('query', true).trim();
		const client = AnilistClient.getInstance().getAniClient();
		const lower = query.toLowerCase();

		if (lower === 'trending') {
			const search = await client.searchMedia({
				type: MediaType.ANIME,
				sort: [MediaSort.TRENDING_DESC]
			});
			const list = search?.results ?? [];
			if (!list.length) return interaction.editReply({ content: '> No trending anime found.' });
			return paginateMediaList(interaction, list, MediaType.ANIME, '🔥 Trending Anime');
		}

		if (lower === 'airing') {
			const search = await client.searchMedia({
				type: MediaType.ANIME,
				status: MediaStatus.RELEASING,
				sort: [MediaSort.POPULARITY_DESC]
			});
			const list = search?.results ?? [];
			if (!list.length) return interaction.editReply({ content: '> No airing anime found.' });
			return paginateMediaList(interaction, list, MediaType.ANIME, '📺 Currently Airing');
		}

		const search = await client.searchMedia({
			query,
			type: MediaType.ANIME,
			sort: [MediaSort.POPULARITY_DESC]
		});
		const media = search?.results?.[0];
		if (!media) return interaction.editReply({ content: '> No anime found.' });

		return interaction.editReply({
			flags: MessageFlags.IsComponentsV2,
			components: [buildMediaContainer(media, MediaType.ANIME)],
			allowedMentions: { parse: [] }
		});
	}
}
