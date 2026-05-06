# Lura Bot

Official assistant for gonzyui's room, built with **TypeScript**, **Sapphire Framework**, and **discord.js**.

Lura is a Discord bot focused on anime, manga, characters, package lookup, repository lookup, and server utility commands. It uses AniList data through [`ani-client`](https://ani-client.js.org/) and is designed to provide clean, modern, and useful responses directly inside Discord.

## Features

- **Anime & Manga** — Lookup with rich cards and detailed metadata.
- **Character profiles** — Profile-style responses with comprehensive information.
- **Developer tools** — GitHub repository and npm package lookup.
- **Notifications** — Real-time release notifications for newly aired anime episodes and anime news feeds.
- **Server utilities** — Configurable notification channels and help command.
- **Modern Discord UI** — Embeds and interactive components.

## Commands

### Anime & Manga

- `/anime` — Show information about an anime.
- `/manga` — Show information about a manga.
- `/characters` — Show information about a character.

### Developer Tools

- `/github` — Show information about a GitHub repository.
- `/npm` — Show information about an npm package.

### Server Configuration

- `/config view` — Display current notification channel settings.
- `/config set airing` — Set the anime airing notification channel.
- `/config set news` — Set the anime news notification channel.
- `/config reset airing` — Remove the airing notification channel.
- `/config reset news` — Remove the news notification channel.

### Utility

- `/help` — Show all available commands.

## Stack

- [TypeScript](https://www.typescriptlang.org/)
- [Sapphire Framework](https://www.sapphirejs.dev/)
- [discord.js](https://discord.js.org/)
- [ani-client](https://ani-client.js.org/)
- [Supabase](https://supabase.com/) — Database & Realtime
- [Redis](https://redis.io/) — Caching & Realtime invalidation
- [Docker](https://www.docker.com/)

## Requirements

For local development without Docker:

- Node.js 24
- pnpm 10
- Redis
- Supabase project

For Docker:

- Docker Engine
- Docker Compose plugin

## Environment variables

Create a `.env` file at the root of the project. Do **not** commit this file.

Example:

```env
DISCORD_TOKEN=your_token_here
WELCOME_CHANNEL=channel_id_here
REDIS_URL=redis://localhost:6379
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here (non anon key)
```

See `.env.example` for a template. Always add `.env` to `.gitignore`.

## Supabase setup

This bot requires a Supabase project for guild settings and realtime notifications.

### 1. Create a Supabase project

Create a new project in the [Supabase dashboard](https://supabase.com/dashboard). During setup, choose your organization, project name, database password, and region.

### 2. Get credentials

In your Supabase project:

- Open Project Settings → API
- Copy Project URL and service_role key
- Add to .env:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

> The service_role key is an admin key—keep it private and never commit it.

### 3. Run migrations

The bot uses Supabase with Realtime subscriptions. Ensure your database schema is set up by running SQL migrations in the Supabase SQL editor (if migrations are included in this repository).

### 4. Enable Realtime

In your Supabase project:

- Go to Replication settings
- Enable realtime for the `guild_settings` table

This allows the bot to receive instant updates when config changes.

## Local development

- Install dependencies:
```bash
pnpm install
```
- Run the build:
```bash
pnpm build
```
- Start the bot locally (Redis must be running):
```bash
pnpm start
```

## Docker

Lura can run with Docker Compose using two services:

- `lura` for the Discord bot
- `lura-redis` for Redis persistence and caching

- Start the stack:
```bash
docker compose up -d --build
```
- View bot logs:
```bash
docker compose logs --tail 100 -f lura
```
- Stop the stack:
```bash
docker compose down
```
- Rebuild after code changes:
```bash
docker compose up -d --build
```

> Note: The repository can stay public while secrets remain only in the local .env file on your machine or server.

## License

- [MIT License](LICENSE)