import { Command } from '@sapphire/framework';
import AnilistClient from '../../aniClient';

export async function autocompleteStaff(interaction: Command.AutocompleteInteraction) {
	const focused = interaction.options.getFocused().trim();

	if (!focused) {
		return interaction.respond([{ name: '🌟 Most Favourited', value: 'top' }]);
	}

	if ('top'.startsWith(focused.toLowerCase())) {
		return interaction.respond([{ name: '🌟 Most Favourited', value: 'top' }]);
	}

	try {
		const client = AnilistClient.getInstance().getAniClient();
		const res = await client.searchStaff({ query: focused });
		const results = res?.results?.slice(0, 24) ?? [];

		const choices = results.map((s: any) => ({
			name: `${s.name.full}${s.primaryOccupations?.[0] ? ` — ${s.primaryOccupations[0]}` : ''}`.slice(0, 100),
			value: s.name.full
		}));

		return interaction.respond([{ name: '🌟 Most Favourited', value: 'top' }, ...choices].slice(0, 25));
	} catch {
		return interaction.respond([]);
	}
}
