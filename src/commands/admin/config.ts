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
	type GuildTextBasedChannel
} from 'discord.js';
import { setAiringChannel, setNewsChannel, setChapterChannel, getGuildSettings } from '../../lib/database/guildSettingsStore';

type ChannelKind = 'airing' | 'news' | 'chapter';

const KIND_LABEL: Record<ChannelKind, string> = {
	airing: '📺 Airing',
	news: '📰 News',
	chapter: '📖 Chapter'
};

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
					name: 'action',
					description: 'What you want to do.',
					type: ApplicationCommandOptionType.String,
					required: true,
					choices: [
						{ name: '👁️ View current configuration', value: 'view' },
						{ name: '📺 Set airing channel', value: 'set_airing' },
						{ name: '📰 Set news channel', value: 'set_news' },
						{ name: '📖 Set chapter channel', value: 'set_chapter' },
						{ name: '🗑️ Reset airing channel', value: 'reset_airing' },
						{ name: '🗑️ Reset news channel', value: 'reset_news' },
						{ name: '🗑️ Reset chapter channel', value: 'reset_chapter' }
					]
				},
				{
					name: 'channel',
					description: 'Channel to set (only required for "set" actions).',
					type: ApplicationCommandOptionType.Channel,
					channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
					required: false
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

		const action = interaction.options.getString('action', true);

		switch (action) {
			case 'view':
				return this.handleView(interaction);
			case 'set_airing':
				return this.handleSet(interaction, 'airing');
			case 'set_news':
				return this.handleSet(interaction, 'news');
			case 'set_chapter':
				return this.handleSet(interaction, 'chapter');
			case 'reset_airing':
				return this.handleReset(interaction, 'airing');
			case 'reset_news':
				return this.handleReset(interaction, 'news');
			case 'reset_chapter':
				return this.handleReset(interaction, 'chapter');
		}
	}

	private async applyChannelChange(guildId: string, kind: ChannelKind, channelId: string | null): Promise<void> {
		switch (kind) {
			case 'airing':
				await setAiringChannel(guildId, channelId);
				return;
			case 'news':
				await setNewsChannel(guildId, channelId);
				return;
			case 'chapter':
				await setChapterChannel(guildId, channelId);
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
							.setDescription('No configuration found. Use `/config` with a `set` action to configure channels.')
							.setFooter({ text: `Guild ID: ${interaction.guildId}` })
							.setTimestamp()
					]
				});
				return;
			}

			const fmt = (id: string | null) => (id ? `<#${id}> (\`${id}\`)` : '❌ Not set');

			const embed = new EmbedBuilder()
				.setColor(0xff1a64)
				.setTitle('Server Configuration')
				.addFields(
					{ name: '📺 Airing Channel', value: fmt(settings.airing_channel_id), inline: false },
					{ name: '📰 News Channel', value: fmt(settings.news_channel_id), inline: false },
					{ name: '📖 Chapter Channel', value: fmt(settings.chapter_channel_id), inline: false },
					{ name: '🔔 Notifications', value: settings.notifications_enabled ? '✅ Enabled' : '❌ Disabled', inline: false }
				)
				.setFooter({ text: `Guild ID: ${interaction.guildId}` })
				.setTimestamp();

			await interaction.editReply({ embeds: [embed] });
		} catch (error) {
			this.container.logger.error('[Config] Failed to fetch settings:', error);
			await interaction.editReply({ content: '❌ Failed to fetch configuration.' });
		}
	}

	private async handleSet(interaction: Command.ChatInputCommandInteraction, kind: ChannelKind): Promise<void> {
		const channel = interaction.options.getChannel('channel', false, [
			ChannelType.GuildText,
			ChannelType.GuildAnnouncement
		]) as GuildTextBasedChannel | null;

		if (!channel) {
			await interaction.editReply({ content: '❌ You must provide a `channel` when using a "set" action.' });
			return;
		}

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
			await this.applyChannelChange(interaction.guildId!, kind, channel.id);

			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xff1a64)
						.setTitle('Configuration updated')
						.setDescription(`✅ **${KIND_LABEL[kind]} Channel** set to <#${channel.id}>`)
						.setFooter({ text: `Guild ID: ${interaction.guildId}` })
						.setTimestamp()
				]
			});
		} catch (error) {
			this.container.logger.error(`[Config] Failed to set ${kind} channel:`, error);
			await interaction.editReply({ content: `❌ Database error while setting ${kind} channel.` });
		}
	}

	private async handleReset(interaction: Command.ChatInputCommandInteraction, kind: ChannelKind): Promise<void> {
		try {
			await this.applyChannelChange(interaction.guildId!, kind, null);

			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xff1a64)
						.setTitle('Configuration updated')
						.setDescription(`✅ **${KIND_LABEL[kind]} Channel** has been removed`)
						.setFooter({ text: `Guild ID: ${interaction.guildId}` })
						.setTimestamp()
				]
			});
		} catch (error) {
			this.container.logger.error(`[Config] Failed to reset ${kind} channel:`, error);
			await interaction.editReply({ content: `❌ Database error while resetting ${kind} channel.` });
		}
	}
}
