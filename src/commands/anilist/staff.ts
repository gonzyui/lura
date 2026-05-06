import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationCommandOptionType, ApplicationIntegrationType, InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import AnilistClient from '../../lib/aniClient';
import { StaffSort } from 'ani-client';
import { buildStaffContainer, buildStaffListContainer } from '../../lib/utils/staffRenderer';
import { autocompleteStaff } from '../../lib/utils/staffAutocomplete';

@ApplyOptions<Command.Options>({
	description: 'Search a voice actor or staff member.',
	requiredClientPermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles],
	cooldownDelay: 3000,
	cooldownLimit: 1
})
export class StaffCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
			integrationTypes: [ApplicationIntegrationType.GuildInstall],
			contexts: [InteractionContextType.Guild],
			options: [
				{
					name: 'query',
					description: 'Staff name, or "top" for most favourited.',
					type: ApplicationCommandOptionType.String,
					required: true,
					autocomplete: true
				}
			]
		});
	}

	public override autocompleteRun(interaction: Command.AutocompleteInteraction) {
		return autocompleteStaff(interaction);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply();

		const query = interaction.options.getString('query', true).trim();
		const client = AnilistClient.getInstance().getAniClient();

		if (query.toLowerCase() === 'top') {
			const res = await client.searchStaff({ sort: [StaffSort.FAVOURITES_DESC] });
			const list = res?.results ?? [];
			if (!list.length) return interaction.editReply({ content: '> No staff found.' });

			return interaction.editReply({
				flags: MessageFlags.IsComponentsV2,
				components: [buildStaffListContainer(list, '🌟 Most Favourited Staff')],
				allowedMentions: { parse: [] }
			});
		}

		const res = await client.searchStaff({ query });
		const staff = res?.results?.[0];
		if (!staff) return interaction.editReply({ content: '> No staff member found.' });

		return interaction.editReply({
			flags: MessageFlags.IsComponentsV2,
			components: [buildStaffContainer(staff)],
			allowedMentions: { parse: [] }
		});
	}
}
