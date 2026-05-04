import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { GuildMember } from 'discord.js';

@ApplyOptions<Listener.Options>({
	event: Events.GuildMemberAdd
})
export class GuildMemberAddListener extends Listener<typeof Events.GuildMemberAdd> {
	public override async run(member: GuildMember) {
		const channelId = process.env.WELCOME_CHANNEL;

		if (!channelId) {
			this.container.logger.warn('[Welcome] Missing WELCOME_CHANNEL in environment variables.');
			return;
		}

		const channel = await member.guild.channels.fetch(channelId).catch(() => null);

		if (!channel || !channel.isSendable()) {
			this.container.logger.warn(`[Welcome] Channel ${channelId} not found or not sendable.`);
			return;
		}

		await channel.send({
			content: `> Welcome to our server ${member.user.username} !`
		});
	}
}
