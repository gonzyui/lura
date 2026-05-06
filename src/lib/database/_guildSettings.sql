create table if not exists public.guild_settings (
    guild_id text primary key,
    airing_channel_id text,
    news_channel_id text,
    notifications_enabled boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists guild_settings_set_updated_at on public.guild_settings;
create trigger guild_settings_set_updated_at
before update on public.guild_settings
for each row
execute function public.set_updated_at();

create index if not exists guild_settings_notifications_enabled_idx
    on public.guild_settings (notifications_enabled)
    where notifications_enabled = true;
create index if not exists guild_settings_airing_channel_id_idx
    on public.guild_settings (airing_channel_id)
    where airing_channel_id is not null;

create index if not exists guild_settings_news_channel_id_idx
    on public.guild_settings (news_channel_id)
    where news_channel_id is not null;

alter table public.guild_settings enable row level security;

drop policy if exists "Service role can manage guild settings" on public.guild_settings;
create policy "Service role can manage guild settings"
on public.guild_settings
as permissive
for all
to service_role
using (true)
with check (true);

do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'guild_settings'
    ) then
        alter publication supabase_realtime add table public.guild_settings;
    end if;
end $$;

alter table public.guild_settings replica identity full;