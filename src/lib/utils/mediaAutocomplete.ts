import type { AutocompleteInteraction } from 'discord.js';
import AnilistClient from '../aniClient';
import { MediaSort, MediaType } from 'ani-client';

export async function autocompleteMedia(interaction: AutocompleteInteraction, type: MediaType, specials: { name: string; value: string }[]) {
	const focused = interaction.options.getFocused().trim();

	if (focused.length < 2) {
		return interaction.respond(specials);
	}

	const lower = focused.toLowerCase();
	if (specials.some((s) => s.value === lower)) {
		return interaction.respond(specials.filter((s) => s.value === lower));
	}

	try {
		const search = await AnilistClient.getInstance()
			.getAniClient()
			.searchMedia({
				query: focused,
				type,
				sort: [MediaSort.POPULARITY_DESC]
			});

		const results = (search?.results ?? []).slice(0, 23).map((m: any) => {
			const title = m.title.romaji || m.title.english || m.title.native || 'Unknown';
			return { name: title.slice(0, 100), value: title.slice(0, 100) };
		});

		return interaction.respond([...specials, ...results].slice(0, 25));
	} catch {
		return interaction.respond(specials);
	}
}
