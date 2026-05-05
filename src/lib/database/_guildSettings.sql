create table if not exists public.guild_settings (
    guild_id text primary key,
    news_channel_id text,
    notifications_enabled boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
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

alter table public.guild_settings enable row level security;

create policy "Service role can manage guild settings"
on public.guild_settings
as permissive
for all
to service_role
using (true)
with check (true);