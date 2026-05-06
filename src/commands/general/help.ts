import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import {
	ActionRowBuilder,
	ApplicationCommandOptionType,
	ApplicationIntegrationType,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	InteractionContextType,
	MessageFlags,
	version as djsVersion
} from 'discord.js';
import { version as sapphireVersion } from '@sapphire/framework';
import { memoryUsage, cpuUsage } from 'node:process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatBytes, formatCategory } from '../../lib/utils/formatters';

const { version: botVersion } = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));

@ApplyOptions<Command.Options>({
	description: 'Shows help for all commands or a specific command.'
})
export class HelpCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
			integrationTypes: [ApplicationIntegrationType.GuildInstall],
			contexts: [InteractionContextType.Guild],
			options: [
				{
					name: 'command',
					description: 'The command name.',
					type: ApplicationCommandOptionType.String,
					required: false
				}
			]
		});
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const query = interaction.options.getString('command')?.trim().toLowerCase();
		const commandStore = this.container.stores.get('commands');

		if (query) {
			const command = commandStore.get(query);

			if (!command) {
				return interaction.reply({
					content: `> Command \`${query}\` not found.`,
					flags: MessageFlags.Ephemeral
				});
			}

			const category = command.fullCategory.length > 0 ? formatCategory(command.fullCategory.join(' > ')) : 'Other';

			const embed = new EmbedBuilder()
				.setColor(0xff1a64)
				.setTitle(`/${command.name}`)
				.setDescription(command.description || 'No description provided.')
				.addFields({ name: 'Category', value: category, inline: true }, { name: 'Usage', value: `\`/${command.name}\``, inline: true })
				.setFooter({ text: 'Lura — Help' })
				.setTimestamp();

			return interaction.reply({
				embeds: [embed],
				allowedMentions: { parse: [] }
			});
		}

		const client = this.container.client;

		const ram = memoryUsage().heapUsed;
		const cpuStart = cpuUsage();
		await new Promise((r) => setTimeout(r, 100));
		const cpuEnd = cpuUsage(cpuStart);
		const cpuPercent = (((cpuEnd.user + cpuEnd.system) / 1e6 / 0.1) * 100).toFixed(1);

		const guilds = client.guilds.cache.size;
		const channels = client.channels.cache.size;

		const commands = [...commandStore.values()].filter((cmd) => cmd.name !== this.name);

		const grouped = new Map<string, Command[]>();
		for (const cmd of commands) {
			const key = cmd.fullCategory.length > 0 ? cmd.fullCategory.join(' > ') : 'Other';
			if (!grouped.has(key)) grouped.set(key, []);
			grouped.get(key)!.push(cmd);
		}

		const categories = [...grouped.keys()].sort((a, b) => a.localeCompare(b));

		const embed = new EmbedBuilder()
			.setColor(0xff1a64)
			.setTitle('Lura — Dashboard')
			.setDescription('Select a category below to browse commands.')
			.addFields(
				{ name: '🌐 Guilds', value: `${guilds}`, inline: true },
				{ name: '💬 Channels', value: `${channels}`, inline: true },
				{ name: '\u200b', value: '\u200b', inline: true },
				{ name: '🧠 RAM', value: formatBytes(ram), inline: true },
				{ name: '⚙️ CPU', value: `${cpuPercent}%`, inline: true },
				{ name: '\u200b', value: '\u200b', inline: true },
				{ name: '📦 Version', value: `v${botVersion}`, inline: true },
				{ name: '📘 discord.js', value: `v${djsVersion}`, inline: true },
				{ name: '🔷 Sapphire', value: `v${sapphireVersion}`, inline: true }
			)
			.setThumbnail(client.user?.displayAvatarURL() ?? null)
			.setFooter({ text: `${commands.length} commands available` })
			.setTimestamp();

		const expiresAt = Date.now() + 60_000;

		const buttons = categories
			.slice(0, 5)
			.map((category) =>
				new ButtonBuilder()
					.setCustomId(`help-category:${interaction.user.id}:${expiresAt}:${category}`)
					.setLabel(formatCategory(category))
					.setStyle(ButtonStyle.Secondary)
			);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

		return interaction.reply({
			embeds: [embed],
			components: buttons.length ? [row] : [],
			allowedMentions: { parse: [] }
		});
	}
}
