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
	public usage = "/help <cmd>";

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
					content: `> Command \`${query}\` not found.`,
					flags: MessageFlags.Ephemeral
				});
			}

			const category = command.fullCategory.length > 0 ? command.fullCategory.join(' > ') : 'Other';
			const usage =
				'usage' in command && typeof (command as { usage?: string }).usage === 'string'
					? (command as { usage?: string }).usage
					: `/${command.name}`;

			const embed = new EmbedBuilder()
				.setColor(0xff1a64)
				.setTitle(`/${command.name}`)
				.setDescription(command.description || 'No description provided.')
				.addFields(
					{ name: 'Category', value: category, inline: true },
					{ name: 'Usage', value: `\`${usage}\``, inline: true },
				)
				.setFooter({ text: 'Lura - Help' })
				.setTimestamp();

			return interaction.reply({
				embeds: [embed],
				allowedMentions: { parse: [] }
			});
		}

		const commands = [...commandStore.values()]
			.filter((command) => command.name !== this.name)
			.sort((a, b) => a.name.localeCompare(b.name));

		const grouped = new Map<string, Command[]>();

		for (const command of commands) {
			const category = command.fullCategory.length > 0 ? command.fullCategory.join(' > ') : 'Other';

			if (!grouped.has(category)) {
				grouped.set(category, []);
			}

			grouped.get(category)!.push(command);
		}

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
						.map((command) => `**/${command.name}** — ${command.description || 'No description provided.'}`)
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