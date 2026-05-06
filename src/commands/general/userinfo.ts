import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import {
	ApplicationCommandType,
	ApplicationIntegrationType,
	EmbedBuilder,
	GuildMember,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	User
} from 'discord.js';

const KEY_PERMISSIONS = [
	[PermissionFlagsBits.Administrator, 'Administrator'],
	[PermissionFlagsBits.ManageGuild, 'Manage Server'],
	[PermissionFlagsBits.ManageRoles, 'Manage Roles'],
	[PermissionFlagsBits.ManageChannels, 'Manage Channels'],
	[PermissionFlagsBits.ManageMessages, 'Manage Messages'],
	[PermissionFlagsBits.ManageWebhooks, 'Manage Webhooks'],
	[PermissionFlagsBits.ManageNicknames, 'Manage Nicknames'],
	[PermissionFlagsBits.KickMembers, 'Kick Members'],
	[PermissionFlagsBits.BanMembers, 'Ban Members'],
	[PermissionFlagsBits.MuteMembers, 'Mute Members'],
	[PermissionFlagsBits.MentionEveryone, 'Mention Everyone'],
	[PermissionFlagsBits.ModerateMembers, 'Timeout Members']
] as const;

@ApplyOptions<Command.Options>({
	description: 'Get information about a user.'
})
export class UserInfoCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
			integrationTypes: [ApplicationIntegrationType.GuildInstall],
			contexts: [InteractionContextType.Guild],
			options: [
				{
					name: 'user',
					description: 'The user to get information about.',
					type: 6,
					required: false
				}
			]
		});

		registry.registerContextMenuCommand({
			name: 'User Info',
			type: ApplicationCommandType.User,
			integrationTypes: [ApplicationIntegrationType.GuildInstall],
			contexts: [InteractionContextType.Guild]
		});
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const user = await (interaction.options.getUser('user') ?? interaction.user).fetch();
		const member = await interaction.guild?.members.fetch(user.id).catch(() => undefined);

		return interaction.reply({
			embeds: [this.buildEmbed(user, member, interaction.guildId)],
			flags: MessageFlags.Ephemeral
		});
	}

	public override async contextMenuRun(interaction: Command.ContextMenuCommandInteraction) {
		if (!interaction.isUserContextMenuCommand()) return;

		const user = await interaction.targetUser.fetch();
		const member = await interaction.guild?.members.fetch(user.id).catch(() => undefined);

		return interaction.reply({
			embeds: [this.buildEmbed(user, member, interaction.guildId)],
			flags: MessageFlags.Ephemeral
		});
	}

	private buildEmbed(user: User, member?: GuildMember, guildId?: string | null) {
		const accentColor = member?.displayColor || (user.accentColor ?? 0x5865f2);

		const embed = new EmbedBuilder()
			.setAuthor({
				name: user.tag,
				iconURL: user.displayAvatarURL({ size: 256 })
			})
			.setThumbnail(member?.displayAvatarURL({ size: 256 }) ?? user.displayAvatarURL({ size: 256 }))
			.setColor(accentColor)
			.setFooter({ text: `ID: ${user.id}` });

		if (user.bannerURL()) {
			embed.setImage(user.bannerURL({ size: 1024 })!);
		}

		embed.addFields({
			name: '👤 Account',
			value: [
				`**Username:** ${user.username}`,
				`**Display Name:** ${user.displayName}`,
				`**Bot:** ${user.bot ? 'Yes' : 'No'}`,
				`**Created:** <t:${Math.floor(user.createdTimestamp / 1000)}:F> (<t:${Math.floor(user.createdTimestamp / 1000)}:R>)`
			].join('\n'),
			inline: false
		});

		if (member) {
			const memberLines = [
				`**Nickname:** ${member.nickname ?? 'None'}`,
				`**Joined:** ${member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F> (<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)` : 'Unknown'}`
			];

			if (member.premiumSinceTimestamp) {
				memberLines.push(`**Boosting since:** <t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>`);
			}

			if (member.communicationDisabledUntilTimestamp && member.communicationDisabledUntilTimestamp > Date.now()) {
				memberLines.push(`**Timed out until:** <t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:R>`);
			}

			embed.addFields({
				name: '🏠 Member',
				value: memberLines.join('\n'),
				inline: false
			});

			const roles = member.roles.cache.filter((r) => r.id !== guildId).sort((a, b) => b.position - a.position);

			const roleCount = roles.size;

			if (roleCount > 0) {
				const displayed = roles.first(5).map((r) => r.toString());
				const extra = roleCount > 5 ? ` *+${roleCount - 5} more*` : '';

				embed.addFields({
					name: `🎭 Roles (${roleCount})`,
					value: displayed.join(', ') + extra,
					inline: false
				});
			}

			const topRole = member.roles.highest;
			if (topRole.id !== guildId) {
				embed.addFields({
					name: '🏆 Highest Role',
					value: topRole.toString(),
					inline: true
				});
			}

			const perms = member.permissions;
			const keyPerms = perms.has(PermissionFlagsBits.Administrator)
				? ['Administrator']
				: KEY_PERMISSIONS.filter(([flag]) => perms.has(flag)).map(([, label]) => label);

			if (keyPerms.length > 0) {
				embed.addFields({
					name: '🔑 Key Permissions',
					value: keyPerms.join(', '),
					inline: false
				});
			}
		}

		return embed;
	}
}
