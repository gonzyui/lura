import { container } from '@sapphire/framework';
import { redis } from './redis';

export const GUILD_SETTINGS_CACHE_PREFIX = 'lura:guild-settings:';
export const GUILD_SETTINGS_CACHE_TTL_SECONDS = 60 * 60; // 1h
export const GUILD_SETTINGS_NULL_SENTINEL = '__NULL__';

export const guildSettingsCacheKey = (guildId: string) =>
    `${GUILD_SETTINGS_CACHE_PREFIX}${guildId}`;

export async function invalidateGuildSettings(guildId: string): Promise<void> {
    try {
        await redis.del(guildSettingsCacheKey(guildId));
    } catch (err) {
        container.logger.warn(
            `[GuildSettings] Cache invalidation failed for ${guildId}:`,
            err
        );
    }
}

export async function invalidateAllGuildSettings(): Promise<void> {
    try {
        const keys = await redis.keys(`${GUILD_SETTINGS_CACHE_PREFIX}*`);
        if (keys.length === 0) return;
        await redis.del(...keys);
        container.logger.info(
            `[GuildSettings] Invalidated ${keys.length} cached guild settings.`
        );
    } catch (err) {
        container.logger.warn('[GuildSettings] Bulk cache invalidation failed:', err);
    }
}
