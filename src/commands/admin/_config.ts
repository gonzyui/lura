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
import { setAiringChannel, setNewsChannel, getGuildSettings } from '../../lib/database/guildSettingsStore';

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
					name: 'view',
					description: 'View current server configuration.',
					type: ApplicationCommandOptionType.Subcommand
				},
				{
					name: 'set',
					description: 'Set notification channels.',
					type: ApplicationCommandOptionType.SubcommandGroup,
					options: [
						{
							name: 'airing',
							description: 'Set the episode notifications channel.',
							type: ApplicationCommandOptionType.Subcommand,
							options: [
								{
									name: 'channel',
									description: 'The channel where episode notifications will be sent.',
									type: ApplicationCommandOptionType.Channel,
									required: true,
									channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement]
								}
							]
						},
						{
							name: 'news',
							description: 'Set the anime news channel.',
							type: ApplicationCommandOptionType.Subcommand,
							options: [
								{
									name: 'channel',
									description: 'The channel where anime news will be sent.',
									type: ApplicationCommandOptionType.Channel,
									required: true,
									channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement]
								}
							]
						}
					]
				},
				{
					name: 'reset',
					description: 'Reset notification channels.',
					type: ApplicationCommandOptionType.SubcommandGroup,
					options: [
						{
							name: 'airing',
							description: 'Remove the episode notifications channel.',
							type: ApplicationCommandOptionType.Subcommand
						},
						{
							name: 'news',
							description: 'Remove the anime news channel.',
							type: ApplicationCommandOptionType.Subcommand
						}
					]
				}
			]
		});
	}
	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
		if (!interaction.inCachedGuild()) {
			await interaction.reply({
				content: '> This command can only be used in a server.',
				flags: MessageFlags.Ephemeral
			});
			return;
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const subcommandGroup = interaction.options.getSubcommandGroup(false);
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === 'view') {
			await this.handleView(interaction);
			return;
		}

		if (subcommandGroup === 'set') {
			await this.handleSet(interaction, subcommand as 'airing' | 'news');
			return;
		}

		if (subcommandGroup === 'reset') {
			await this.handleReset(interaction, subcommand as 'airing' | 'news');
			return;
		}
	}

	private async handleView(interaction: Command.ChatInputCommandInteraction): Promise<void> {
		try {
			const settings = await getGuildSettings(interaction.guildId!);

			if (!settings) {
				await interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor(0xff1a64)
							.setTitle('Server Configuration')
							.setDescription('No configuration found. Use `/config set` to configure channels.')
							.setFooter({ text: `Guild ID: ${interaction.guildId}` })
							.setTimestamp()
					]
				});
				return;
			}

			const airingChannelText = settings.airing_channel_id
				? `<#${settings.airing_channel_id}> (\`${settings.airing_channel_id}\`)`
				: '❌ Not set';

			const newsChannelText = settings.news_channel_id ? `<#${settings.news_channel_id}> (\`${settings.news_channel_id}\`)` : '❌ Not set';

			const notificationsText = settings.notifications_enabled ? '✅ Enabled' : '❌ Disabled';

			const embed = new EmbedBuilder()
				.setColor(0xff1a64)
				.setTitle('Server Configuration')
				.addFields(
					{
						name: '📺 Airing Channel',
						value: airingChannelText,
						inline: false
					},
					{
						name: '📰 News Channel',
						value: newsChannelText,
						inline: false
					},
					{
						name: '🔔 Notifications',
						value: notificationsText,
						inline: false
					}
				)
				.setFooter({ text: `Guild ID: ${interaction.guildId}` })
				.setTimestamp();

			await interaction.editReply({ embeds: [embed] });
		} catch (error) {
			this.container.logger.error('[Config] Failed to fetch settings:', error);
			await interaction.editReply({
				content: '❌ Failed to fetch configuration.'
			});
		}
	}

	private async handleSet(interaction: Command.ChatInputCommandInteraction, type: 'airing' | 'news'): Promise<void> {
		const channel = interaction.options.getChannel('channel', true, [ChannelType.GuildText, ChannelType.GuildAnnouncement]);
		const me = interaction.guild!.members.me!;

		const botPerms = channel.permissionsFor(me);
		const missing: string[] = [];

		if (!botPerms?.has(PermissionFlagsBits.ViewChannel)) missing.push('View Channel');
		if (!botPerms?.has(PermissionFlagsBits.SendMessages)) missing.push('Send Messages');
		if (!botPerms?.has(PermissionFlagsBits.EmbedLinks)) missing.push('Embed Links');

		if (missing.length > 0) {
			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xff0000)
						.setTitle('Configuration failed')
						.setDescription(`❌ Missing permissions in <#${channel.id}>:\n${missing.map((p) => `• ${p}`).join('\n')}`)
						.setFooter({ text: `Guild ID: ${interaction.guildId}` })
						.setTimestamp()
				]
			});
			return;
		}

		try {
			if (type === 'airing') {
				await setAiringChannel(interaction.guildId!, channel.id);
			} else {
				await setNewsChannel(interaction.guildId!, channel.id);
			}

			const typeName = type === 'airing' ? '📺 Airing' : '📰 News';

			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xff1a64)
						.setTitle('Configuration updated')
						.setDescription(`✅ **${typeName} Channel** set to <#${channel.id}>`)
						.setFooter({ text: `Guild ID: ${interaction.guildId}` })
						.setTimestamp()
				]
			});
		} catch (error) {
			this.container.logger.error(`[Config] Failed to set ${type} channel:`, error);
			await interaction.editReply({
				content: `❌ Database error while setting ${type} channel.`
			});
		}
	}

	private async handleReset(interaction: Command.ChatInputCommandInteraction, type: 'airing' | 'news'): Promise<void> {
		try {
			if (type === 'airing') {
				await setAiringChannel(interaction.guildId!, null);
			} else {
				await setNewsChannel(interaction.guildId!, null);
			}

			const typeName = type === 'airing' ? '📺 Airing' : '📰 News';

			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xff1a64)
						.setTitle('Configuration updated')
						.setDescription(`✅ **${typeName} Channel** has been removed`)
						.setFooter({ text: `Guild ID: ${interaction.guildId}` })
						.setTimestamp()
				]
			});
		} catch (error) {
			this.container.logger.error(`[Config] Failed to reset ${type} channel:`, error);
			await interaction.editReply({
				content: `❌ Database error while resetting ${type} channel.`
			});
		}
	}
}
