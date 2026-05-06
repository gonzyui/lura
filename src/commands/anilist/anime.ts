import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationCommandOptionType, ApplicationIntegrationType, InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import AnilistClient from '../../lib/aniClient';
import { MediaSort, MediaStatus, MediaType } from 'ani-client';
import { buildMediaContainer, buildMediaListContainer } from '../../lib/utils/mediaRenderer';

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

	public override async autocompleteRun(interaction: Command.AutocompleteInteraction) {
		const focused = interaction.options.getFocused().toLowerCase();
		const suggestions = [
			{ name: '🔥 Trending', value: 'trending' },
			{ name: '📺 Currently Airing', value: 'airing' }
		].filter((s) => s.name.toLowerCase().includes(focused) || s.value.includes(focused));

		return interaction.respond(suggestions);
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

			return interaction.editReply({
				flags: MessageFlags.IsComponentsV2,
				components: [buildMediaListContainer(list, MediaType.ANIME, '🔥 Trending Anime')],
				allowedMentions: { parse: [] }
			});
		}

		if (lower === 'airing') {
			const search = await client.searchMedia({
				type: MediaType.ANIME,
				status: MediaStatus.RELEASING,
				sort: [MediaSort.POPULARITY_DESC]
			});
			const list = search?.results ?? [];
			if (!list.length) return interaction.editReply({ content: '> No airing anime found.' });

			return interaction.editReply({
				flags: MessageFlags.IsComponentsV2,
				components: [buildMediaListContainer(list, MediaType.ANIME, '📺 Currently Airing')],
				allowedMentions: { parse: [] }
			});
		}

		// Search by name (default)
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
