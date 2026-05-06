import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import {
	ApplicationCommandOptionType,
	ApplicationIntegrationType,
	ChannelType,
	EmbedBuilder,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits
} from 'discord.js';
import { setNewsChannel } from '../../lib/database/guildSettingsStore';

@ApplyOptions<Command.Options>({
	description: 'Configure the bot for this server.',
	requiredClientPermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
	requiredUserPermissions: [PermissionFlagsBits.ManageGuild]
})
export class ConfigCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
			integrationTypes: [ApplicationIntegrationType.GuildInstall],
			contexts: [InteractionContextType.Guild],
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
		if (!interaction.inCachedGuild()) {
			return interaction.reply({
				content: '> This command can only be used in a server.',
				flags: MessageFlags.Ephemeral
			});
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const channel = interaction.options.getChannel('news_channel', true, [ChannelType.GuildText, ChannelType.GuildAnnouncement]);

		const me = interaction.guild.members.me!;
		const botPerms = channel.permissionsFor(me);
		const missing: string[] = [];

		if (!botPerms?.has(PermissionFlagsBits.ViewChannel)) missing.push('View Channel');
		if (!botPerms?.has(PermissionFlagsBits.SendMessages)) missing.push('Send Messages');
		if (!botPerms?.has(PermissionFlagsBits.EmbedLinks)) missing.push('Embed Links');

		if (missing.length > 0) {
			return interaction.editReply({
				content: `> I'm missing the following permissions in ${channel}: **${missing.join(', ')}**.`
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

			return interaction.editReply({ embeds: [embed] });
		} catch (error) {
			this.container.logger.error('[Config] Failed to update guild settings:', error);

			return interaction.editReply({
				content: '> Failed to update the server configuration. Please try again later.'
			});
		}
	}
}
