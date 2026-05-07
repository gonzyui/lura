import { container } from '@sapphire/framework';
import { redis } from './redis';
import type { GuildSettings } from './guildSettingsStore';

export const GUILD_SETTINGS_CACHE_PREFIX = 'lura:guild-settings:';
export const GUILD_SETTINGS_CACHE_TTL_SECONDS = 60 * 60;
export const GUILD_SETTINGS_NULL_SENTINEL = '__NULL__';

type MemoryEntry = {
	value: GuildSettings | null;
	expiresAt: number;
};

const memoryCache = new Map<string, MemoryEntry>();
const MEMORY_TTL_MS = 5 * 60 * 1000;

export const guildSettingsCacheKey = (guildId: string) => `${GUILD_SETTINGS_CACHE_PREFIX}${guildId}`;

export function getMemoryCache(guildId: string): { hit: boolean; value: GuildSettings | null } {
	const entry = memoryCache.get(guildId);
	if (!entry) return { hit: false, value: null };

	if (entry.expiresAt < Date.now()) {
		memoryCache.delete(guildId);
		return { hit: false, value: null };
	}

	return { hit: true, value: entry.value };
}

export function setMemoryCache(guildId: string, value: GuildSettings | null): void {
	memoryCache.set(guildId, {
		value,
		expiresAt: Date.now() + MEMORY_TTL_MS
	});
}

export function deleteMemoryCache(guildId: string): void {
	memoryCache.delete(guildId);
}

export function clearMemoryCache(): void {
	memoryCache.clear();
}

export async function invalidateGuildSettings(guildId: string): Promise<void> {
	deleteMemoryCache(guildId);
	try {
		await redis.del(guildSettingsCacheKey(guildId));
	} catch (err) {
		container.logger.warn(`[GuildSettings] Cache invalidation failed for ${guildId}:`, err);
	}
}

export async function invalidateAllGuildSettings(): Promise<void> {
	clearMemoryCache();
	try {
		const keys: string[] = [];
		const stream = redis.scanStream({
			match: `${GUILD_SETTINGS_CACHE_PREFIX}*`,
			count: 100
		});

		for await (const batch of stream) {
			keys.push(...(batch as string[]));
		}

		if (keys.length === 0) return;
		await redis.del(...keys);
		container.logger.info(`[GuildSettings] Invalidated ${keys.length} cached guild settings.`);
	} catch (err) {
		container.logger.warn('[GuildSettings] Bulk cache invalidation failed:', err);
	}
}
