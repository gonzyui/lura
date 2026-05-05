import supabase from './supabase';

export type GuildSettings = {
    guild_id: string;
    news_channel_id: string | null;
    notifications_enabled: boolean;
    created_at?: string;
    updated_at?: string;
};

export async function getGuildSettings(guildId: string): Promise<GuildSettings | null> {
    const { data, error } = await supabase
        .from('guild_settings')
        .select('*')
        .eq('guild_id', guildId)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data;
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
}) {
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

    if (error) {
        throw error;
    }

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