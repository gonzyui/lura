import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationCommandOptionType, ApplicationIntegrationType, InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import AnilistClient from '../../lib/aniClient';
import { MediaSort, MediaType } from 'ani-client';
import { buildMediaContainer } from '../../lib/utils/mediaRenderer';
import { paginateMediaList } from '../../lib/utils/paginator';
import { autocompleteMedia } from '../../lib/utils/mediaAutocomplete';

const SPECIALS = [
	{ name: '🔥 Trending', value: 'trending' },
	{ name: '🏆 Top Rated', value: 'top' }
];

@ApplyOptions<Command.Options>({
	description: 'Search a manga, or browse trending / top-rated.',
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
					name: 'query',
					description: 'Manga name, or "trending" / "top".',
					type: ApplicationCommandOptionType.String,
					required: true,
					autocomplete: true
				}
			]
		});
	}

	public override async autocompleteRun(interaction: Command.AutocompleteInteraction) {
		return autocompleteMedia(interaction, MediaType.MANGA, SPECIALS);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply();

		const query = interaction.options.getString('query', true).trim();
		const client = AnilistClient.getInstance().getAniClient();
		const lower = query.toLowerCase();

		if (lower === 'trending') {
			const search = await client.searchMedia({ type: MediaType.MANGA, sort: [MediaSort.TRENDING_DESC] });
			const list = search?.results ?? [];
			if (!list.length) return interaction.editReply({ content: '> No trending manga found.' });
			return paginateMediaList(interaction, list, MediaType.MANGA, '🔥 Trending Manga');
		}

		if (lower === 'top') {
			const search = await client.searchMedia({ type: MediaType.MANGA, sort: [MediaSort.SCORE_DESC] });
			const list = search?.results ?? [];
			if (!list.length) return interaction.editReply({ content: '> No top manga found.' });
			return paginateMediaList(interaction, list, MediaType.MANGA, '🏆 Top Manga');
		}

		const search = await client.searchMedia({
			query,
			type: MediaType.MANGA,
			sort: [MediaSort.POPULARITY_DESC]
		});
		const media = search?.results?.[0];
		if (!media) return interaction.editReply({ content: '> No manga found.' });

		return interaction.editReply({
			flags: MessageFlags.IsComponentsV2,
			components: [buildMediaContainer(media, MediaType.MANGA)],
			allowedMentions: { parse: [] }
		});
	}
}
