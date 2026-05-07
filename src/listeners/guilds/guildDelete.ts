import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { Guild } from 'discord.js';
import { deleteGuild } from '../../lib/database/guildSettingsStore';
import { sendGuildLog } from '../../lib/utils/guildLogger';

@ApplyOptions<Listener.Options>({
	event: Events.GuildDelete
})
export class GuildDeleteListener extends Listener<typeof Events.GuildDelete> {
	public override async run(guild: Guild) {
		this.container.logger.info(`[GuildDelete] Removed from guild: ${guild.name ?? 'unknown'} (${guild.id})`);
		await sendGuildLog(this.container.client, guild, 'leave');

		try {
			await deleteGuild(guild.id);
			this.container.logger.info(`[GuildDelete] Cleaned up settings for ${guild.id}`);
		} catch (err) {
			this.container.logger.error(`[GuildDelete] Failed to delete settings for ${guild.id}:`, err);
		}
	}
}
