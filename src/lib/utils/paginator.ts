import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { MediaType } from 'ani-client';
import { buildMediaListContainer } from './renderer/media';

export async function paginateMediaList(interaction: ChatInputCommandInteraction, list: any[], type: MediaType, title: string) {
	let page = 0;

	const render = (p: number, disabled = false) => {
		const { container, totalPages } = buildMediaListContainer(list, type, title, p);
		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`media-page:prev`)
				.setLabel('◀ Prev')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(disabled || p === 0),
			new ButtonBuilder()
				.setCustomId(`media-page:next`)
				.setLabel('Next ▶')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(disabled || p >= totalPages - 1)
		);
		return { components: [container, row], totalPages };
	};

	const { components } = render(page);
	const message = await interaction.editReply({
		flags: MessageFlags.IsComponentsV2,
		components,
		allowedMentions: { parse: [] }
	});

	const collector = message.createMessageComponentCollector({
		componentType: ComponentType.Button,
		idle: 60_000,
		filter: (i) => i.customId.startsWith('media-page:')
	});

	collector.on('collect', async (btn) => {
		if (btn.user.id !== interaction.user.id) {
			await btn.reply({ content: '> These buttons are not for you.', flags: MessageFlags.Ephemeral });
			return;
		}
		page = btn.customId.endsWith('next') ? page + 1 : page - 1;
		const { components } = render(page);
		await btn.update({ components });
	});

	collector.on('end', async () => {
		try {
			const { components } = render(page, true);
			await interaction.editReply({ components });
		} catch {}
	});
}
