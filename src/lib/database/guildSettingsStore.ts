import { container } from '@sapphire/framework';
import supabase from './supabase';
import { redis } from './redis';
import {
	guildSettingsCacheKey,
	invalidateGuildSettings,
	getMemoryCache,
	setMemoryCache,
	GUILD_SETTINGS_CACHE_TTL_SECONDS,
	GUILD_SETTINGS_NULL_SENTINEL
} from './guildSettingsCache';

export type GuildSettings = {
	guild_id: string;
	airing_channel_id: string | null;
	news_channel_id: string | null;
	chapter_channel_id: string | null;
	notifications_enabled: boolean;
	created_at?: string;
	updated_at?: string;
};

export async function getGuildSettings(guildId: string): Promise<GuildSettings | null> {
	const mem = getMemoryCache(guildId);
	if (mem.hit) return mem.value;

	const key = guildSettingsCacheKey(guildId);

	try {
		const cached = await redis.get(key);
		if (cached !== null) {
			const value = cached === GUILD_SETTINGS_NULL_SENTINEL ? null : (JSON.parse(cached) as GuildSettings);
			setMemoryCache(guildId, value);
			return value;
		}
	} catch (err) {
		container.logger.warn(`[GuildSettings] Redis get failed for ${guildId}, falling back to DB:`, err);
	}

	const { data, error } = await supabase.from('guild_settings').select('*').eq('guild_id', guildId).maybeSingle();
	if (error) throw error;

	const value = (data as GuildSettings | null) ?? null;

	setMemoryCache(guildId, value);
	try {
		const serialized = value ? JSON.stringify(value) : GUILD_SETTINGS_NULL_SENTINEL;
		await redis.setex(key, GUILD_SETTINGS_CACHE_TTL_SECONDS, serialized);
	} catch (err) {
		container.logger.warn(`[GuildSettings] Redis cache write failed for ${guildId}:`, err);
	}

	return value;
}

export async function getAiringChannelId(guildId: string): Promise<string | null> {
	const settings = await getGuildSettings(guildId);
	if (!settings?.notifications_enabled) return null;
	return settings.airing_channel_id;
}

export async function getNewsChannelId(guildId: string): Promise<string | null> {
	const settings = await getGuildSettings(guildId);
	if (!settings?.notifications_enabled) return null;
	return settings.news_channel_id;
}

export async function _getChapterChannelId(guildId: string): Promise<string | null> {
	const settings = await getGuildSettings(guildId);
	if (!settings?.notifications_enabled) return null;
	return settings.chapter_channel_id;
}

async function mergeAndUpsert(
	guildId: string,
	updates: Partial<Omit<GuildSettings, 'guild_id' | 'created_at' | 'updated_at'>>
): Promise<GuildSettings> {
	const existing = await getGuildSettings(guildId);

	const payload = {
		guild_id: guildId,
		airing_channel_id: updates.airing_channel_id !== undefined ? updates.airing_channel_id : (existing?.airing_channel_id ?? null),
		news_channel_id: updates.news_channel_id !== undefined ? updates.news_channel_id : (existing?.news_channel_id ?? null),
		chapter_channel_id: updates.chapter_channel_id !== undefined ? updates.chapter_channel_id : (existing?.chapter_channel_id ?? null),
		notifications_enabled: updates.notifications_enabled !== undefined ? updates.notifications_enabled : (existing?.notifications_enabled ?? true)
	};

	const { data, error } = await supabase.from('guild_settings').upsert(payload, { onConflict: 'guild_id' }).select().single();
	if (error) throw error;

	await invalidateGuildSettings(guildId);
	return data as GuildSettings;
}

export async function setAiringChannel(guildId: string, channelId: string | null): Promise<GuildSettings> {
	const existing = await getGuildSettings(guildId);

	const willHaveNews = existing?.news_channel_id ?? null;
	const willHaveChapter = existing?.chapter_channel_id ?? null;
	const enableNotifs = Boolean(channelId || willHaveNews || willHaveChapter);

	return mergeAndUpsert(guildId, {
		airing_channel_id: channelId,
		notifications_enabled: enableNotifs
	});
}

export async function setNewsChannel(guildId: string, channelId: string | null): Promise<GuildSettings> {
	const existing = await getGuildSettings(guildId);

	const willHaveAiring = existing?.airing_channel_id ?? null;
	const willHaveChapter = existing?.chapter_channel_id ?? null;
	const enableNotifs = Boolean(channelId || willHaveAiring || willHaveChapter);

	return mergeAndUpsert(guildId, {
		news_channel_id: channelId,
		notifications_enabled: enableNotifs
	});
}

export async function _setChapterChannel(guildId: string, channelId: string | null): Promise<GuildSettings> {
	const existing = await getGuildSettings(guildId);

	const willHaveAiring = existing?.airing_channel_id ?? null;
	const willHaveNews = existing?.news_channel_id ?? null;
	const enableNotifs = Boolean(channelId || willHaveAiring || willHaveNews);

	return mergeAndUpsert(guildId, {
		chapter_channel_id: channelId,
		notifications_enabled: enableNotifs
	});
}

export async function setNotificationsEnabled(guildId: string, enabled: boolean): Promise<GuildSettings> {
	return mergeAndUpsert(guildId, { notifications_enabled: enabled });
}

export async function ensure(guildId: string): Promise<void> {
	const { error } = await supabase.from('guild_settings').upsert({ guild_id: guildId }, { onConflict: 'guild_id', ignoreDuplicates: true });
	if (error) throw error;
	await invalidateGuildSettings(guildId);
}

export async function deleteGuild(guildId: string): Promise<void> {
	const { error } = await supabase.from('guild_settings').delete().eq('guild_id', guildId);
	if (error) throw error;
	await invalidateGuildSettings(guildId);
}

export async function _listGuildsWithChapterChannel(): Promise<Array<{ guildId: string; channelId: string }>> {
	const { data, error } = await supabase
		.from('guild_settings')
		.select('guild_id, chapter_channel_id, notifications_enabled')
		.not('chapter_channel_id', 'is', null)
		.eq('notifications_enabled', true);

	if (error) {
		container.logger.error('[GuildSettings] listGuildsWithChapterChannel failed:', error);
		return [];
	}

	return (data ?? [])
		.filter((row) => row.chapter_channel_id)
		.map((row) => ({ guildId: row.guild_id, channelId: row.chapter_channel_id as string }));
}

export { invalidateGuildSettings } from './guildSettingsCache';
