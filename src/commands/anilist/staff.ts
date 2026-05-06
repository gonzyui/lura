import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationCommandOptionType, ApplicationIntegrationType, InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize } from 'discord.js';
import AnilistClient from '../../lib/aniClient';
import { StaffSort } from 'ani-client';
import { formatDate, truncate } from '../../lib/utils/formatters';

@ApplyOptions<Command.Options>({
	description: 'Get info about an anime staff member, or browse the most popular.',
	requiredClientPermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
	cooldownDelay: 3000,
	cooldownLimit: 1
})
export class StaffCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
			integrationTypes: [ApplicationIntegrationType.GuildInstall],
			contexts: [InteractionContextType.Guild],
			options: [
				{
					name: 'name',
					description: 'Staff member name, or "top" for the most popular.',
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
			const search = await client.searchStaff({ sort: [StaffSort.FAVOURITES_DESC] });
			const list = (search?.results ?? []).slice(0, 10);
			if (!list.length) return interaction.editReply({ content: '> No staff found.' });

			const lines = list
				.map((s, i) => {
					const name = s.name?.full ?? 'Unknown';
					const jobs = (s.primaryOccupations ?? []).slice(0, 2).join(', ') || 'Unknown';
					const favs = s.favourites ?? 0;
					return `**${i + 1}.** [${name}](${s.siteUrl}) — ${jobs} • ❤️ ${favs.toLocaleString()}`;
				})
				.join('\n');

			const container = new ContainerBuilder()
				.setAccentColor(0x02a9ff)
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🏆 Top Staff\n${lines}`));

			return interaction.editReply({
				flags: MessageFlags.IsComponentsV2,
				components: [container],
				allowedMentions: { parse: [] }
			});
		}

		const search = await client.searchStaff({ query, sort: [StaffSort.FAVOURITES_DESC] });
		const staff = search?.results?.[0];
		if (!staff) return interaction.editReply({ content: '> No staff member found.' });

		const name = staff.name?.full ?? staff.name?.native ?? 'Unknown';
		const nativeName = staff.name?.native ? ` (${staff.name.native})` : '';
		const description = truncate(staff.description ?? '', 700);

		const yearsActive =
			staff.yearsActive && staff.yearsActive.length > 0
				? staff.yearsActive.length === 1
					? `${staff.yearsActive[0]}–present`
					: `${staff.yearsActive[0]}–${staff.yearsActive[staff.yearsActive.length - 1]}`
				: 'Unknown';

		const quickFacts = [
			`**Occupation:** ${(staff.primaryOccupations ?? []).join(', ') || 'Unknown'}`,
			`**Gender:** ${staff.gender ?? 'Unknown'}`,
			`**Age:** ${staff.age ?? 'Unknown'}`,
			`**Birthday:** ${formatDate(staff.dateOfBirth)}`,
			staff.dateOfDeath?.year ? `**Died:** ${formatDate(staff.dateOfDeath)}` : null,
			`**Hometown:** ${staff.homeTown ?? 'Unknown'}`,
			`**Blood type:** ${staff.bloodType ?? 'Unknown'}`,
			`**Years active:** ${yearsActive}`,
			`**Favorites:** ❤️ ${(staff.favourites ?? 0).toLocaleString()}`,
			staff.siteUrl ? `**AniList:** ${staff.siteUrl}` : null
		]
			.filter(Boolean)
			.join('\n');

		const container = new ContainerBuilder().setAccentColor(0x02a9ff);

		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(`# ${name}${nativeName}`),
					new TextDisplayBuilder().setContent(description || '*No description available.*')
				)
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(staff.image?.large || staff.image?.medium || '').setDescription(`Portrait of ${name}`)
				)
		);

		container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(quickFacts));

		return interaction.editReply({
			flags: MessageFlags.IsComponentsV2,
			components: [container],
			allowedMentions: { parse: [] }
		});
	}
}
