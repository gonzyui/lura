import { container } from '@sapphire/framework';
import {
    createClient,
    REALTIME_SUBSCRIBE_STATES,
    type RealtimeChannel
} from '@supabase/supabase-js';
import { invalidateGuildSettings } from './guildSettingsCache';

type GuildSettingsRow = {
    guild_id: string;
    news_channel_id: string | null;
    notifications_enabled: boolean;
    created_at: string;
    updated_at: string;
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
    throw new Error('[Supabase] SUPABASE_URL is not defined.');
}

if (!supabaseServiceRoleKey) {
    throw new Error('[Supabase] SUPABASE_SERVICE_ROLE_KEY is not defined.');
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    },
    realtime: {
        params: {
            eventsPerSecond: 10
        },
        heartbeatIntervalMs: 30_000,
        timeout: 20_000
    }
});

let guildSettingsChannel: RealtimeChannel | null = null;
let reconnectAttempts = 0;
let reconnectTimer: NodeJS.Timeout | null = null;
const MAX_RECONNECT_DELAY = 60_000;

function scheduleReconnect() {
    if (reconnectTimer) return;

    const delay = Math.min(1_000 * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY);
    reconnectAttempts++;

    container.logger.warn(
        `[Supabase] Reconnecting guild_settings channel in ${delay}ms (attempt ${reconnectAttempts})`
    );

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        subscribeGuildSettings();
    }, delay);
}

function subscribeGuildSettings() {
    if (guildSettingsChannel) {
        supabase.removeChannel(guildSettingsChannel).catch((err) => {
            container.logger.warn('[Supabase] Failed to remove old channel:', err);
        });
        guildSettingsChannel = null;
    }

    guildSettingsChannel = supabase
        .channel('guild-settings-logs')
        .on<GuildSettingsRow>(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'guild_settings' },
            async (payload) => {
                const guildId =
                    (payload.new && 'guild_id' in payload.new && payload.new.guild_id) ||
                    (payload.old && 'guild_id' in payload.old && payload.old.guild_id);

                if (!guildId) return;

                await invalidateGuildSettings(guildId);
                container.logger.info(
                    `[Supabase] guild_settings ${payload.eventType} for ${guildId} → cache invalidated`
                );
            }
        )
        .subscribe((status, err) => {
            switch (status) {
                case REALTIME_SUBSCRIBE_STATES.SUBSCRIBED:
                    reconnectAttempts = 0;
                    container.logger.info(
                        '[Supabase] guild_settings channel subscribed successfully.'
                    );
                    break;

                case REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR:
                    container.logger.error('[Supabase] Channel error:', err);
                    scheduleReconnect();
                    break;

                case REALTIME_SUBSCRIBE_STATES.TIMED_OUT:
                    container.logger.warn('[Supabase] Channel timed out.');
                    scheduleReconnect();
                    break;

                case REALTIME_SUBSCRIBE_STATES.CLOSED:
                    container.logger.warn('[Supabase] Channel closed.');
                    scheduleReconnect();
                    break;
            }
        });
}

subscribeGuildSettings();

process.on('SIGTERM', () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (guildSettingsChannel) {
        supabase.removeChannel(guildSettingsChannel).catch(() => { });
    }
});

export default supabase;
