import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import {
	ApplicationIntegrationType,
	ChannelType,
	EmbedBuilder,
	GuildExplicitContentFilter,
	GuildMFALevel,
	GuildNSFWLevel,
	GuildPremiumTier,
	GuildVerificationLevel,
	InteractionContextType,
	MessageFlags
} from 'discord.js';

const VERIFICATION_LEVEL: Record<GuildVerificationLevel, string> = {
	[GuildVerificationLevel.None]: 'None',
	[GuildVerificationLevel.Low]: 'Low',
	[GuildVerificationLevel.Medium]: 'Medium',
	[GuildVerificationLevel.High]: 'High',
	[GuildVerificationLevel.VeryHigh]: 'Highest'
};

const EXPLICIT_FILTER: Record<GuildExplicitContentFilter, string> = {
	[GuildExplicitContentFilter.Disabled]: 'Disabled',
	[GuildExplicitContentFilter.MembersWithoutRoles]: 'Members without roles',
	[GuildExplicitContentFilter.AllMembers]: 'All members'
};

const NSFW_LEVEL: Record<GuildNSFWLevel, string> = {
	[GuildNSFWLevel.Default]: 'Default',
	[GuildNSFWLevel.Explicit]: 'Explicit',
	[GuildNSFWLevel.Safe]: 'Safe',
	[GuildNSFWLevel.AgeRestricted]: 'Age Restricted'
};

const BOOST_TIER: Record<GuildPremiumTier, string> = {
	[GuildPremiumTier.None]: 'No tier',
	[GuildPremiumTier.Tier1]: 'Tier 1',
	[GuildPremiumTier.Tier2]: 'Tier 2',
	[GuildPremiumTier.Tier3]: 'Tier 3'
};

const MFA_LEVEL: Record<GuildMFALevel, string> = {
	[GuildMFALevel.None]: 'None',
	[GuildMFALevel.Elevated]: 'Enabled'
};

@ApplyOptions<Command.Options>({
	description: 'Get information about this server.'
})
export class ServerInfoCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
			integrationTypes: [ApplicationIntegrationType.GuildInstall],
			contexts: [InteractionContextType.Guild]
		});
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const guild = interaction.guild!;

		const fullGuild = await guild.fetch();
		const owner = await fullGuild.fetchOwner();

		const channels = fullGuild.channels.cache;
		const textChannels = channels.filter((c) => c.type === ChannelType.GuildText).size;
		const voiceChannels = channels.filter((c) => c.type === ChannelType.GuildVoice).size;
		const categoryChannels = channels.filter((c) => c.type === ChannelType.GuildCategory).size;
		const forumChannels = channels.filter((c) => c.type === ChannelType.GuildForum).size;
		const stageChannels = channels.filter((c) => c.type === ChannelType.GuildStageVoice).size;

		const members = fullGuild.members.cache;
		const totalMembers = fullGuild.memberCount;
		const botCount = members.filter((m) => m.user.bot).size;
		const humanCount = totalMembers - botCount;

		const roles = fullGuild.roles.cache.filter((r) => r.id !== fullGuild.id);
		const emojis = fullGuild.emojis.cache;
		const staticEmojis = emojis.filter((e) => !e.animated).size;
		const animatedEmojis = emojis.filter((e) => !!e.animated).size;
		const stickers = fullGuild.stickers.cache.size;

		const embed = new EmbedBuilder()
			.setAuthor({
				name: fullGuild.name,
				iconURL: fullGuild.iconURL({ size: 256 }) ?? undefined
			})
			.setColor(0x5865f2)
			.setThumbnail(fullGuild.iconURL({ size: 512 }))
			.setFooter({ text: `ID: ${fullGuild.id} • Created` })
			.setTimestamp(fullGuild.createdAt);

		if (fullGuild.bannerURL()) {
			embed.setImage(fullGuild.bannerURL({ size: 1024 })!);
		}

		embed.addFields({
			name: '📋 General',
			value: [
				`**Owner:** ${owner.user.tag} (${owner.id})`,
				`**Created:** <t:${Math.floor(fullGuild.createdTimestamp / 1000)}:F> (<t:${Math.floor(fullGuild.createdTimestamp / 1000)}:R>)`,
				`**Description:** ${fullGuild.description ?? 'None'}`,
				`**Language:** ${fullGuild.preferredLocale}`,
				`**Vanity URL:** ${fullGuild.vanityURLCode ? `discord.gg/${fullGuild.vanityURLCode}` : 'None'}`
			].join('\n')
		});

		embed.addFields({
			name: `👥 Members (${totalMembers})`,
			value: [`**Humans:** ${humanCount}`, `**Bots:** ${botCount}`].join('\n'),
			inline: true
		});

		embed.addFields({
			name: `📢 Channels (${channels.size})`,
			value: [
				`**Text:** ${textChannels}`,
				`**Voice:** ${voiceChannels}`,
				`**Category:** ${categoryChannels}`,
				forumChannels ? `**Forum:** ${forumChannels}` : null,
				stageChannels ? `**Stage:** ${stageChannels}` : null
			]
				.filter(Boolean)
				.join('\n'),
			inline: true
		});

		embed.addFields({
			name: `🎭 Roles (${roles.size})`,
			value:
				roles.size > 0
					? roles
							.sort((a, b) => b.position - a.position)
							.first(5)
							.map((r) => r.toString())
							.join(', ') + (roles.size > 5 ? ` *+${roles.size - 5} more*` : '')
					: 'None',
			inline: false
		});

		embed.addFields({
			name: '😀 Emojis & Stickers',
			value: [`**Static:** ${staticEmojis}`, `**Animated:** ${animatedEmojis}`, `**Stickers:** ${stickers}`].join('\n'),
			inline: true
		});

		embed.addFields({
			name: '🚀 Boost',
			value: [`**Tier:** ${BOOST_TIER[fullGuild.premiumTier]}`, `**Boosts:** ${fullGuild.premiumSubscriptionCount ?? 0}`].join('\n'),
			inline: true
		});

		embed.addFields({
			name: '🔒 Security',
			value: [
				`**Verification:** ${VERIFICATION_LEVEL[fullGuild.verificationLevel]}`,
				`**Explicit Content:** ${EXPLICIT_FILTER[fullGuild.explicitContentFilter]}`,
				`**NSFW Level:** ${NSFW_LEVEL[fullGuild.nsfwLevel]}`,
				`**2FA Moderation:** ${MFA_LEVEL[fullGuild.mfaLevel]}`
			].join('\n'),
			inline: false
		});

		if (fullGuild.features.length > 0) {
			embed.addFields({
				name: '✨ Features',
				value: fullGuild.features.map((f) => `\`${f.toLowerCase().replaceAll('_', ' ')}\``).join(', ')
			});
		}

		return interaction.reply({
			embeds: [embed],
			flags: MessageFlags.Ephemeral
		});
	}
}
