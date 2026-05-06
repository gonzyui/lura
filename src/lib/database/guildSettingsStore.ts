import { container } from '@sapphire/framework';
import supabase from './supabase';
import { redis } from './redis';
import {
    guildSettingsCacheKey,
    invalidateGuildSettings,
    GUILD_SETTINGS_CACHE_TTL_SECONDS,
    GUILD_SETTINGS_NULL_SENTINEL
} from './guildSettingsCache';

export type GuildSettings = {
    guild_id: string;
    news_channel_id: string | null;
    notifications_enabled: boolean;
    created_at?: string;
    updated_at?: string;
};

export async function getGuildSettings(guildId: string): Promise<GuildSettings | null> {
    const key = guildSettingsCacheKey(guildId);

    try {
        const cached = await redis.get(key);
        if (cached !== null) {
            if (cached === GUILD_SETTINGS_NULL_SENTINEL) return null;
            return JSON.parse(cached) as GuildSettings;
        }
    } catch (err) {
        container.logger.warn(
            `[GuildSettings] Redis get failed for ${guildId}, falling back to DB:`,
            err
        );
    }

    const { data, error } = await supabase
        .from('guild_settings')
        .select('*')
        .eq('guild_id', guildId)
        .maybeSingle();

    if (error) throw error;

    try {
        const value = data ? JSON.stringify(data) : GUILD_SETTINGS_NULL_SENTINEL;
        await redis.setex(key, GUILD_SETTINGS_CACHE_TTL_SECONDS, value);
    } catch (err) {
        container.logger.warn(`[GuildSettings] Redis cache write failed for ${guildId}:`, err);
    }

    return data as GuildSettings | null;
}

export async function getNewsChannelId(guildId: string): Promise<string | null> {
    const settings = await getGuildSettings(guildId);
    if (!settings?.notifications_enabled) return null;
    return settings.news_channel_id;
}

export async function upsertGuildSettings(input: {
    guildId: string;
    newsChannelId?: string | null;
    notificationsEnabled?: boolean;
}): Promise<GuildSettings> {
    const payload = {
        guild_id: input.guildId,
        news_channel_id: input.newsChannelId ?? null,
        notifications_enabled: input.notificationsEnabled ?? true
    };

    const { data, error } = await supabase
        .from('guild_settings')
        .upsert(payload, { onConflict: 'guild_id' })
        .select()
        .single();

    if (error) throw error;

    await invalidateGuildSettings(input.guildId);

    return data as GuildSettings;
}

export async function setNewsChannel(guildId: string, channelId: string | null) {
    return upsertGuildSettings({
        guildId,
        newsChannelId: channelId,
        notificationsEnabled: channelId ? true : false
    });
}

export async function setNotificationsEnabled(guildId: string, enabled: boolean) {
    const existing = await getGuildSettings(guildId);

    return upsertGuildSettings({
        guildId,
        newsChannelId: existing?.news_channel_id ?? null,
        notificationsEnabled: enabled
    });
}

export { invalidateGuildSettings } from './guildSettingsCache';
