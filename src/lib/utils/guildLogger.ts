import { container } from '@sapphire/framework';
import { EmbedBuilder, WebhookClient, type Client, type Guild, time, TimestampStyles } from 'discord.js';

export type GuildEventType = 'join' | 'leave';

let webhook: WebhookClient | null | undefined = undefined;

function getWebhook(): WebhookClient | null {
	if (webhook !== undefined) return webhook;

	const url = process.env.GUILD_LOG_WEBHOOK_URL;
	if (!url) {
		container.logger.warn('[GuildLogger] GUILD_LOG_WEBHOOK_URL not set, guild events will not be logged.');
		webhook = null;
	} else {
		webhook = new WebhookClient({ url });
	}

	return webhook;
}

export async function sendGuildLog(client: Client, guild: Guild, type: GuildEventType) {
	const wh = getWebhook();
	if (!wh) return;

	try {
		const owner = await guild.fetchOwner().catch(() => null);
		const guildCount = client.guilds.cache.size;

		const isJoin = type === 'join';
		const embed = new EmbedBuilder()
			.setTitle(isJoin ? '✅ New Server' : '❌ Server Left')
			.setColor(isJoin ? 0x57f287 : 0xed4245)
			.setThumbnail(guild.iconURL({ size: 256 }))
			.addFields(
				{ name: 'Name', value: guild.name, inline: true },
				{ name: 'ID', value: guild.id, inline: true },
				{ name: 'Members', value: guild.memberCount.toLocaleString(), inline: true },
				{ name: 'Owner', value: owner ? `${owner.user.tag} (\`${owner.id}\`)` : 'Unknown', inline: false },
				{
					name: 'Created',
					value: `${time(guild.createdAt, TimestampStyles.LongDate)} (${time(guild.createdAt, TimestampStyles.RelativeTime)})`,
					inline: false
				}
			)
			.setFooter({ text: `Now in ${guildCount.toLocaleString()} servers` })
			.setTimestamp();

		await wh.send({
			embeds: [embed],
			username: client.user?.username ?? 'Bot Logger',
			avatarURL: client.user?.displayAvatarURL() ?? undefined,
			allowedMentions: { parse: [] }
		});
	} catch (error) {
		container.logger.error(`[GuildLogger] Failed to send ${type} log for ${guild.id}:`, error);
	}
}
