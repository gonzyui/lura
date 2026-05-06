import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationCommandOptionType, ApplicationIntegrationType, InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import {
	ContainerBuilder,
	TextDisplayBuilder,
	SeparatorBuilder,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	SeparatorSpacingSize
} from 'discord.js';
import AnilistClient from '../../lib/aniClient';
import { StudioSort } from 'ani-client';

@ApplyOptions<Command.Options>({
	description: 'Get info about an anime studio, or browse the most popular.',
	requiredClientPermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
	cooldownDelay: 3000,
	cooldownLimit: 1
})
export class StudioCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
			integrationTypes: [ApplicationIntegrationType.GuildInstall],
			contexts: [InteractionContextType.Guild],
			options: [
				{
					name: 'name',
					description: 'Studio name, or "top" for the most popular.',
					type: ApplicationCommandOptionType.String,
					required: true
				}
			]
		});
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply();

		const query = interaction.options.getString('name', true).trim();
		const client = AnilistClient.getInstance().getAniClient();

		if (query.toLowerCase() === 'top') {
			const search = await client.searchStudios({ sort: [StudioSort.FAVOURITES_DESC] });
			const list = (search?.results ?? []).slice(0, 10);
			if (!list.length) return interaction.editReply({ content: '> No studios found.' });

			const lines = list
				.map((s, i) => {
					const favs = s.favourites ?? 0;
					const type = s.isAnimationStudio ? '🎬 Animation' : '🏢 Studio';
					return `**${i + 1}.** [${s.name}](${s.siteUrl}) — ${type} • ❤️ ${favs.toLocaleString()}`;
				})
				.join('\n');

			const container = new ContainerBuilder()
				.setAccentColor(0xe85d04)
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🏆 Top Studios\n${lines}`));

			return interaction.editReply({
				flags: MessageFlags.IsComponentsV2,
				components: [container],
				allowedMentions: { parse: [] }
			});
		}

		const search = await client.searchStudios({ query, sort: [StudioSort.FAVOURITES_DESC] });
		const studio = search?.results?.[0];
		if (!studio) return interaction.editReply({ content: '> No studio found.' });

		const seen = new Set<number>();
		const uniqueMedia = (studio.media?.nodes ?? []).filter((m) => {
			if (!m?.id || seen.has(m.id)) return false;
			seen.add(m.id);
			return true;
		});

		const topMedia = uniqueMedia.slice(0, 8);

		const quickFacts = [
			`**Type:** ${studio.isAnimationStudio ? '🎬 Animation Studio' : '🏢 Studio'}`,
			`**Favorites:** ❤️ ${(studio.favourites ?? 0).toLocaleString()}`,
			`**Total works:** ${studio.media?.pageInfo?.total ?? 'Unknown'}`,
			studio.siteUrl ? `**AniList:** ${studio.siteUrl}` : null
		]
			.filter(Boolean)
			.join('\n');

		const mediaList = topMedia
			.map((m) => {
				const title = m.title?.english || m.title?.romaji || m.title?.native || 'Unknown';
				const format = m.format ?? '';
				return `• [${title}](${m.siteUrl}) ${format ? `*(${format})*` : ''}`;
			})
			.join('\n');

		const container = new ContainerBuilder().setAccentColor(0xe85d04);

		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${studio.name}`));
		container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(quickFacts));

		if (mediaList) {
			container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Notable Works**\n${mediaList}`));
		}

		const galleryItems = topMedia
			.filter((m) => m.coverImage?.large)
			.slice(0, 6)
			.map((m) => new MediaGalleryItemBuilder().setURL(m.coverImage!.large!).setDescription(m.title?.english || m.title?.romaji || ''));

		if (galleryItems.length > 0) {
			container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
			container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(galleryItems));
		}

		return interaction.editReply({
			flags: MessageFlags.IsComponentsV2,
			components: [container],
			allowedMentions: { parse: [] }
		});
	}
}
