import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ActionRow, ButtonComponent, ButtonInteraction } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, MessageFlags } from 'discord.js';
import { formatCategory } from '../lib/utils/formatters';

export class HelpButtonsHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.Button
		});
	}

	public override parse(interaction: ButtonInteraction) {
		if (!interaction.customId.startsWith('help-category:')) return this.none();

		const [, userId, expiresAt, ...categoryParts] = interaction.customId.split(':');
		const category = categoryParts.join(':');
		if (!userId || !expiresAt || !category) return this.none();

		return this.some({ userId, expiresAt: Number(expiresAt), category });
	}

	public override async run(
		interaction: ButtonInteraction,
		{ userId, expiresAt, category }: { userId: string; expiresAt: number; category: string }
	) {
		if (Date.now() > expiresAt) {
			const disabledRows = (interaction.message.components as ActionRow<ButtonComponent>[]).map((row) =>
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					row.components
						.filter((btn): btn is ButtonComponent => btn.type === ComponentType.Button)
						.map((btn) => ButtonBuilder.from(btn).setDisabled(true))
				)
			);

			await interaction.update({ components: disabledRows });

			return interaction.followUp({
				content: '> This help menu has expired. Use `/help` again.',
				flags: MessageFlags.Ephemeral
			});
		}

		if (interaction.user.id !== userId) {
			return interaction.reply({
				content: '> This help menu is not for you.',
				flags: MessageFlags.Ephemeral
			});
		}

		const commandStore = this.container.stores.get('commands');
		const commands = [...commandStore.values()].filter((cmd) => cmd.name !== 'help').sort((a, b) => a.name.localeCompare(b.name));

		const grouped = new Map<string, typeof commands>();
		for (const cmd of commands) {
			const key = cmd.fullCategory.length > 0 ? cmd.fullCategory.join(' > ') : 'Other';
			if (!grouped.has(key)) grouped.set(key, []);
			grouped.get(key)!.push(cmd);
		}

		const categories = [...grouped.keys()].sort((a, b) => a.localeCompare(b));
		const currentCommands = grouped.get(category) ?? [];

		const embed = new EmbedBuilder()
			.setColor(0xff1a64)
			.setTitle(`${formatCategory(category)} — Commands`)
			.addFields({
				name: '\u200b',
				value:
					currentCommands
						.map((cmd) => `**/${cmd.name}** — ${cmd.description || 'No description provided.'}`)
						.join('\n')
						.slice(0, 1024) || 'No commands available.'
			})
			.setFooter({ text: `${currentCommands.length} command(s) in this category` })
			.setTimestamp();

		const buttons = categories.slice(0, 5).map((entry) =>
			new ButtonBuilder()
				.setCustomId(`help-category:${userId}:${expiresAt}:${entry}`)
				.setLabel(formatCategory(entry))
				.setStyle(entry === category ? ButtonStyle.Primary : ButtonStyle.Secondary)
		);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

		return interaction.update({
			embeds: [embed],
			components: buttons.length ? [row] : []
		});
	}
}
