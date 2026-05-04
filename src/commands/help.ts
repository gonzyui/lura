import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationCommandOptionType, ApplicationIntegrationType, EmbedBuilder, InteractionContextType, MessageFlags } from 'discord.js';

@ApplyOptions<Command.Options>({
	description: 'Shows help for all commands or a specific command.'
})
export class HelpCommand extends Command {
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
					name: 'command',
					description: 'The command name.',
					type: ApplicationCommandOptionType.String,
					required: false
				}
			]
		});
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const query = interaction.options.getString('command')?.trim().toLowerCase();
		const commandStore = this.container.stores.get('commands');

		if (query) {
			const command = commandStore.get(query);

			if (!command) {
				return interaction.reply({
					content: `Command \`${query}\` not found.`,
					flags: MessageFlags.Ephemeral
				});
			}

			const embed = new EmbedBuilder()
				.setColor(0xff1a64)
				.setTitle(`/${command.name}`)
				.setDescription(command.description || 'No description provided.')
				.setFooter({ text: 'Lura - Help' })
				.setTimestamp();

			return interaction.reply({
				embeds: [embed],
				allowedMentions: { parse: [] }
			});
		}

		const commands = [...commandStore.values()].filter((command) => command.name !== this.name).sort((a, b) => a.name.localeCompare(b.name));

		const embed = new EmbedBuilder()
			.setColor(0xff1a64)
			.setTitle('Available Commands')
			.setDescription(
				commands.map((command) => `**/${command.name}** — ${command.description || 'No description provided.'}`).join('\n') ||
					'No commands available.'
			)
			.setFooter({ text: `Total commands: ${commands.length}` })
			.setTimestamp();

		return interaction.reply({
			embeds: [embed],
			allowedMentions: { parse: [] }
		});
	}
}
