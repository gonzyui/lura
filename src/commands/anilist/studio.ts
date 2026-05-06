import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationCommandOptionType, ApplicationIntegrationType, InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import AnilistClient from '../../lib/aniClient';
import { StudioSort } from 'ani-client';
import { buildStudioContainer, buildStudioListContainer } from '../../lib/utils/studioRenderer';
import { autocompleteStudio } from '../../lib/utils/studioAutocomplete';

@ApplyOptions<Command.Options>({
	description: 'Search an animation studio.',
	requiredClientPermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles],
	cooldownDelay: 3000,
	cooldownLimit: 1
})
export class StudioCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
			integrationTypes: [ApplicationIntegrationType.GuildInstall],
			contexts: [InteractionContextType.Guild],
			options: [
				{
					name: 'query',
					description: 'Studio name, or "top" for most favourited.',
					type: ApplicationCommandOptionType.String,
					required: true,
					autocomplete: true
				}
			]
		});
	}

	public override autocompleteRun(interaction: Command.AutocompleteInteraction) {
		return autocompleteStudio(interaction);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply();

		const query = interaction.options.getString('query', true).trim();
		const client = AnilistClient.getInstance().getAniClient();

		if (query.toLowerCase() === 'top') {
			const res = await client.searchStudios({ sort: [StudioSort.FAVOURITES_DESC] });
			const list = res?.results ?? [];
			if (!list.length) return interaction.editReply({ content: '> No studios found.' });

			return interaction.editReply({
				flags: MessageFlags.IsComponentsV2,
				components: [buildStudioListContainer(list, '🌟 Most Favourited Studios')],
				allowedMentions: { parse: [] }
			});
		}

		const res = await client.searchStudios({ query });
		const studio = res?.results?.[0];
		if (!studio) return interaction.editReply({ content: '> No studio found.' });

		return interaction.editReply({
			flags: MessageFlags.IsComponentsV2,
			components: [buildStudioContainer(studio)],
			allowedMentions: { parse: [] }
		});
	}
}
