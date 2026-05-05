import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import {
    ApplicationCommandOptionType,
    ApplicationIntegrationType,
    ChannelType,
    EmbedBuilder,
    InteractionContextType,
    MessageFlags,
    PermissionFlagsBits,
    TextChannel
} from 'discord.js';
import { setNewsChannel } from '../../lib/database/guildSettingsStore';

@ApplyOptions<Command.Options>({
    description: 'Configure the bot for this server.'
})
export class ConfigCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        const integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];
        const contexts: InteractionContextType[] = [InteractionContextType.Guild];

        registry.registerChatInputCommand({
            name: this.name,
            description: this.description,
            integrationTypes,
            contexts,
            defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
            options: [
                {
                    name: 'news_channel',
                    description: 'The channel where episode notifications will be sent.',
                    type: ApplicationCommandOptionType.Channel,
                    required: true,
                    channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement]
                }
            ]
        });
    }

    public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        if (!interaction.inGuild() || !interaction.guildId) {
            return interaction.reply({
                content: '> This command can only be used in a server.',
                flags: MessageFlags.Ephemeral,
                allowedMentions: { parse: [] }
            });
        }

        const memberPermissions = interaction.memberPermissions;
        if (!memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: '> You need the Manage Server permission to use this command.',
                flags: MessageFlags.Ephemeral,
                allowedMentions: { parse: [] }
            });
        }

        const channel: TextChannel = interaction.options.getChannel('news_channel', true);

        if (!channel.isSendable() || channel.isDMBased()) {
            return interaction.reply({
                content: '> Please choose a server text channel.',
                flags: MessageFlags.Ephemeral,
                allowedMentions: { parse: [] }
            });
        }

        try {
            await setNewsChannel(interaction.guildId, channel.id);

            const embed = new EmbedBuilder()
                .setColor(0xff1a64)
                .setTitle('Configuration updated')
                .setDescription(`Episode notifications will now be sent to ${channel}.`)
                .setFooter({ text: `Guild ID: ${interaction.guildId}` })
                .setTimestamp();

            return interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
                allowedMentions: { parse: [] }
            });
        } catch (error) {
            this.container.logger.error('[Config] Failed to update guild settings:', error);

            return interaction.reply({
                content: '> Failed to update the server configuration.',
                flags: MessageFlags.Ephemeral,
                allowedMentions: { parse: [] }
            });
        }
    }
}