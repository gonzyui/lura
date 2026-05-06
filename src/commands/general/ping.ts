import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, InteractionContextType } from 'discord.js';

@ApplyOptions<Command.Options>({
	description: 'Ping pong!'
})
export class PingCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
			integrationTypes: [ApplicationIntegrationType.GuildInstall],
			contexts: [InteractionContextType.Guild]
		});
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const pingMessage = await interaction.reply({ content: '> Ping?', fetchReply: true });

		const apiLatency = pingMessage.createdTimestamp - interaction.createdTimestamp;
		const wsLatency = Math.round(this.container.client.ws.ping);

		return interaction.editReply({
			content: `> Pong! Bot Latency **${wsLatency}ms**. API Latency **${apiLatency}ms**.`
		});
	}
}
