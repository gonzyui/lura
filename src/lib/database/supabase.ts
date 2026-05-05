import { container } from '@sapphire/framework';
import { createClient } from '@supabase/supabase-js';

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
    }
});

const guildSettingsChannel = supabase
    .channel('guild-settings-logs')
    .on<GuildSettingsRow>(
        'postgres_changes',
        {
            event: '*',
            schema: 'public',
            table: 'guild_settings'
        },
        (payload) => {
            const guildId =
                'guild_id' in payload.new
                    ? payload.new.guild_id
                    : 'guild_id' in payload.old
                        ? payload.old.guild_id
                        : 'unknown';

            container.logger.info(
                `[Supabase] guild_settings ${payload.eventType} for guild ${guildId}`
            );
        }
    )
    .subscribe((status) => {
        container.logger.info(`[Supabase] Realtime guild_settings channel status: ${status}`);
    });

export { guildSettingsChannel };
export default supabase;