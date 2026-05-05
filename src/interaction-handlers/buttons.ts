import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags
} from 'discord.js';

export class HelpButtonsHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(ctx, {
            ...options,
            interactionHandlerType: InteractionHandlerTypes.Button
        });
    }

    public override parse(interaction: ButtonInteraction) {
        if (!interaction.customId.startsWith('help-category:')) return this.none();

        const [, userId, category] = interaction.customId.split(':');
        return this.some({ userId, category });
    }

    public override async run(
        interaction: ButtonInteraction,
        parsed: InteractionHandler.ParseResult<this>
    ) {
        const { userId, category } = parsed;

        if (interaction.user.id !== userId) {
            return interaction.reply({
                content: `> This help menu is not for you.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const commandStore = this.container.stores.get('commands');
        const commands = [...commandStore.values()]
            .filter((command) => command.name !== 'help')
            .sort((a, b) => a.name.localeCompare(b.name));

        const grouped = new Map<string, typeof commands>();

        for (const command of commands) {
            const key = command.fullCategory.length > 0 ? command.fullCategory.join(' > ') : 'Other';

            if (!grouped.has(key)) {
                grouped.set(key, []);
            }

            grouped.get(key)!.push(command);
        }

        const categories = [...grouped.keys()].sort((a, b) => a.localeCompare(b));
        const currentCommands = grouped.get(category) ?? [];

        const embed = new EmbedBuilder()
            .setColor(0xff1a64)
            .setTitle('Help Menu')
            .setDescription(`Category: **${category}**`)
            .addFields({
                name: category,
                value:
                    currentCommands
                        .map((command) => `**/${command.name}** — ${command.description || 'No description provided.'}`)
                        .join('\n')
                        .slice(0, 1024) || 'No commands available.'
            })
            .setFooter({ text: `Total commands: ${commands.length}` })
            .setTimestamp();

        const buttons = categories.slice(0, 5).map((entry) =>
            new ButtonBuilder()
                .setCustomId(`help-category:${userId}:${entry}`)
                .setLabel(entry)
                .setStyle(entry === category ? ButtonStyle.Primary : ButtonStyle.Secondary)
        );

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

        return interaction.update({
            embeds: [embed],
            components: buttons.length ? [row] : []
        });
    }
}