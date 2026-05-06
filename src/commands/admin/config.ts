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
import { setAiringChannel, setNewsChannel } from '../../lib/database/guildSettingsStore';

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
					name: 'airing_channel',
					description: 'The channel where episode notifications will be sent.',
					type: ApplicationCommandOptionType.Channel,
					required: false,
					channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement]
				},
				{
					name: 'news_channel',
					description: 'The channel where anime news will be sent.',
					type: ApplicationCommandOptionType.Channel,
					required: false,
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

		const airingChannel = interaction.options.getChannel('airing_channel', false, [ChannelType.GuildText, ChannelType.GuildAnnouncement]);
		const newsChannel = interaction.options.getChannel('news_channel', false, [ChannelType.GuildText, ChannelType.GuildAnnouncement]);

		if (!airingChannel && !newsChannel) {
			return interaction.editReply({
				content: '> You must specify at least one channel (airing_channel or news_channel).'
			});
		}

		const me = interaction.guild.members.me!;
		const results: { name: string; success: boolean; channel?: string; error?: string }[] = [];

		if (airingChannel) {
			const botPerms = airingChannel.permissionsFor(me);
			const missing: string[] = [];

			if (!botPerms?.has(PermissionFlagsBits.ViewChannel)) missing.push('View Channel');
			if (!botPerms?.has(PermissionFlagsBits.SendMessages)) missing.push('Send Messages');
			if (!botPerms?.has(PermissionFlagsBits.EmbedLinks)) missing.push('Embed Links');

			if (missing.length > 0) {
				results.push({
					name: 'Airing Channel',
					success: false,
					error: `Missing: ${missing.join(', ')}`
				});
			} else {
				try {
					await setAiringChannel(interaction.guildId, airingChannel.id);
					results.push({
						name: 'Airing Channel',
						success: true,
						channel: airingChannel.name
					});
				} catch (error) {
					this.container.logger.error('[Config] Failed to set airing channel:', error);
					results.push({
						name: 'Airing Channel',
						success: false,
						error: 'Database error'
					});
				}
			}
		}

		if (newsChannel) {
			const botPerms = newsChannel.permissionsFor(me);
			const missing: string[] = [];

			if (!botPerms?.has(PermissionFlagsBits.ViewChannel)) missing.push('View Channel');
			if (!botPerms?.has(PermissionFlagsBits.SendMessages)) missing.push('Send Messages');
			if (!botPerms?.has(PermissionFlagsBits.EmbedLinks)) missing.push('Embed Links');

			if (missing.length > 0) {
				results.push({
					name: 'News Channel',
					success: false,
					error: `Missing: ${missing.join(', ')}`
				});
			} else {
				try {
					await setNewsChannel(interaction.guildId, newsChannel.id);
					results.push({
						name: 'News Channel',
						success: true,
						channel: newsChannel.name
					});
				} catch (error) {
					this.container.logger.error('[Config] Failed to set news channel:', error);
					results.push({
						name: 'News Channel',
						success: false,
						error: 'Database error'
					});
				}
			}
		}

		const successCount = results.filter((r) => r.success).length;

		const embed = new EmbedBuilder()
			.setColor(successCount > 0 ? 0xff1a64 : 0xff0000)
			.setTitle(successCount > 0 ? 'Configuration updated' : 'Configuration failed')
			.setDescription(results.map((r) => (r.success ? `✅ **${r.name}**: ${r.channel}` : `❌ **${r.name}**: ${r.error}`)).join('\n'))
			.setFooter({ text: `Guild ID: ${interaction.guildId}` })
			.setTimestamp();

		return interaction.editReply({ embeds: [embed] });
	}
}
