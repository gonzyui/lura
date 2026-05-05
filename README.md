# Lura Bot

Official assistant for gonzyui's room, built with **TypeScript**, **Sapphire Framework**, and **discord.js**.

Lura is a Discord bot focused on anime, manga, characters, package lookup, repository lookup, and server utility commands. It uses AniList data through [`ani-client`](https://ani-client.js.org/) and is designed to provide clean, modern, and useful responses directly inside Discord.

## Features

- Anime lookup with rich cards.
- Manga lookup with detailed metadata.
- Character lookup with profile-style responses.
- GitHub repository lookup.
- npm package lookup.
- Help command generated from loaded commands.
- Release notifications for newly aired anime episodes.
- Modern Discord UI with embeds and display components where relevant.

## Commands

### Anime

- `/anime` — Show information about an anime.
- `/manga` — Show information about a manga.
- `/characters` — Show information about a character.

### Developer Tools

- `/github` — Show information about a GitHub repository.
- `/npm` — Show information about an npm package.

### Utility

- `/help` — Show all available commands.

## Stack

- [TypeScript](https://www.typescriptlang.org/)
- [Sapphire Framework](https://www.sapphirejs.dev/)
- [discord.js](https://discord.js.org/)
- [ani-client](https://ani-client.js.org/)
- [Docker](https://www.docker.com/)
- [Redis](https://redis.io/)

## Requirements

For local development without Docker:

- Node.js 24
- pnpm 10
- Redis

For Docker:

- Docker Engine
- Docker Compose plugin

## Environment variables

Create a `.env` file at the root of the project. Do **not** commit this file.

Example:

```env
DISCORD_TOKEN=
WELCOME_CHANNEL=
REDIS_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

You should also keep a `.env.example` in the repository for documentation, and add `.env` to `.gitignore` so secrets never end up in the public repository.

## Supabase setup

This bot requires a Supabase project for its database.

### 1. Create a Supabase project

Create a new project in the [Supabase dashboard](https://supabase.com/dashboard). During setup, choose your organization, project name, database password, and region.

### 2. Get the project URL and API keys

In your Supabase project:

- Open **Project Settings**
- Open **API**
- Copy:
  - **Project URL**
  - **service_role key**

Use them in your `.env` file:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The `service_role` key is an admin key and must stay private on the server only.

### 3. Get the database connection string

In the Supabase dashboard, open your project and get the Postgres connection string from the database connection settings. The connection string uses the standard PostgreSQL URI format and should be added as `SUPABASE_URL` in your `.env` file.

Example format:

```env
SUPABASE_DB_URL=postgresql://postgres:your-password@db.your-project-ref.supabase.co:5432/postgres
```

If Supabase shows a password placeholder, replace it with the database password you chose when creating the project.

### 4. Run your database setup

If this project includes SQL migrations, schema files, or setup scripts, run them before starting the bot. For example, this may involve executing SQL in the Supabase SQL editor or running a migration command from the project locally.

### 5. Keep secrets private

Never commit your real Supabase keys to the repository. For public repositories, keep the real `.env` only on your machine or server, and commit only a `.env.example` template.

Do not expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code, public configs, or client-side environments.

## Local development

Install dependencies:

```bash
pnpm install
```

Run the build:

```bash
pnpm build
```

Start the bot locally:

```bash
pnpm start
```

If your local setup uses Redis outside Docker, make sure Redis is running before starting the bot.

## Docker

Lura can run with Docker Compose using two services:

- `lura` for the Discord bot
- `lura-redis` for Redis persistence and caching

Start the stack:

```bash
docker compose up -d --build
```

View bot logs:

```bash
docker compose logs --tail 100 -f lura
```

Stop the stack:

```bash
docker compose down
```

Rebuild after code changes:

```bash
docker compose up -d --build
```

If you keep your `.env` file on the server, Docker Compose will inject those variables into the container at runtime rather than baking them into the image.

## Docker notes

- The repository can stay public while secrets remain only in the local `.env` file on your machine or server.
- Redis data should be stored in a Docker volume so it survives container restarts.
- A custom Docker image is useful for reproducible deployments and cleaner production setups with TypeScript and pnpm.

## License

Licensed under the [MIT License](LICENSE).