import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import {
	ActionRowBuilder,
	ApplicationCommandOptionType,
	ApplicationIntegrationType,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	InteractionContextType,
	MessageFlags
} from 'discord.js';

@ApplyOptions<Command.Options>({
	description: 'Shows help for all commands or a specific command.'
})
export class HelpCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
			integrationTypes: [ApplicationIntegrationType.GuildInstall],
			contexts: [InteractionContextType.Guild],
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
					content: `> Command \`${query}\` not found.`,
					flags: MessageFlags.Ephemeral
				});
			}

			const category = command.fullCategory.length > 0 ? command.fullCategory.join(' > ') : 'Other';

			const embed = new EmbedBuilder()
				.setColor(0xff1a64)
				.setTitle(`/${command.name}`)
				.setDescription(command.description || 'No description provided.')
				.addFields(
					{ name: 'Category', value: category, inline: true },
					{ name: 'Usage', value: `\`/${command.name}\``, inline: true }
				)
				.setFooter({ text: 'Lura - Help' })
				.setTimestamp();

			return interaction.reply({
				embeds: [embed],
				allowedMentions: { parse: [] }
			});
		}

		const commands = [...commandStore.values()]
			.filter((cmd) => cmd.name !== this.name)
			.sort((a, b) => a.name.localeCompare(b.name));

		const grouped = commands.reduce<Map<string, Command[]>>((map, cmd) => {
			const category = cmd.fullCategory.length > 0 ? cmd.fullCategory.join(' > ') : 'Other';
			if (!map.has(category)) map.set(category, []);
			map.get(category)!.push(cmd);
			return map;
		}, new Map());

		const categories = [...grouped.keys()].sort((a, b) => a.localeCompare(b));
		const currentCategory = categories[0] ?? 'Other';
		const currentCommands = grouped.get(currentCategory) ?? [];

		const embed = new EmbedBuilder()
			.setColor(0xff1a64)
			.setTitle('Help Menu')
			.setDescription(`Category: **${currentCategory}**`)
			.addFields({
				name: currentCategory,
				value:
					currentCommands
						.map((cmd) => `**/${cmd.name}** — ${cmd.description || 'No description provided.'}`)
						.join('\n')
						.slice(0, 1024) || 'No commands available.'
			})
			.setFooter({ text: `Total commands: ${commands.length}` })
			.setTimestamp();

		const buttons = categories.slice(0, 5).map((category) =>
			new ButtonBuilder()
				.setCustomId(`help-category:${interaction.user.id}:${category}`)
				.setLabel(category)
				.setStyle(category === currentCategory ? ButtonStyle.Primary : ButtonStyle.Secondary)
		);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

		return interaction.reply({
			embeds: [embed],
			components: buttons.length ? [row] : [],
			allowedMentions: { parse: [] }
		});
	}
}
