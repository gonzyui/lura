import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { ChannelType, EmbedBuilder, PermissionFlagsBits, type Guild, type TextChannel } from 'discord.js';
import { ensure } from '../../lib/database/guildSettingsStore';

@ApplyOptions<Listener.Options>({
	event: Events.GuildCreate
})
export class GuildCreateListener extends Listener<typeof Events.GuildCreate> {
	public override async run(guild: Guild) {
		this.container.logger.info(`[GuildCreate] Joined guild: ${guild.name} (${guild.id}) — ${guild.memberCount} members`);

		try {
			await ensure(guild.id);
		} catch (err) {
			this.container.logger.error(`[GuildCreate] Failed to ensure settings for ${guild.id}:`, err);
		}
		const channel = this.findWelcomeChannel(guild);
		if (!channel) {
			this.container.logger.warn(`[GuildCreate] No suitable channel found in ${guild.id} to send welcome message.`);
			return;
		}

		const embed = new EmbedBuilder()
			.setColor(0x5865f2)
			.setTitle('👋 Thanks for adding me!')
			.setDescription(
				[
					"Hey there! I'm your new anime companion bot.",
					'',
					'**🎬 What I can do:**',
					'• 📺 Notify you when new anime episodes air',
					'• 📰 Send anime news from Anime News Network',
					'• 🔍 Search anime, manga, and characters via AniList',
					'• 🛠️ Provide useful utility commands',
					'',
					'**⚙️ Get started:**',
					'Use `/config` to set up your notification channels and preferences.',
					'',
					'**📚 Need help?**',
					'Use `/help` to see all available commands.'
				].join('\n')
			)
			.setFooter({ text: 'Made with ❤️ by gonzyui' })
			.setTimestamp();

		try {
			await channel.send({ embeds: [embed] });
		} catch (err) {
			this.container.logger.warn(`[GuildCreate] Failed to send welcome message in ${guild.id}:`, err);
		}
	}

	private findWelcomeChannel(guild: Guild): TextChannel | null {
		const me = guild.members.me;
		if (!me) return null;

		if (guild.systemChannel?.permissionsFor(me).has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel])) {
			return guild.systemChannel;
		}
		const channel = guild.channels.cache.find(
			(c) =>
				c.type === ChannelType.GuildText &&
				c.permissionsFor(me)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.EmbedLinks])
		);

		return (channel as TextChannel) ?? null;
	}
}
