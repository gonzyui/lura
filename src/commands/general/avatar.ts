import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import {
	ApplicationCommandType,
	ApplicationIntegrationType,
	EmbedBuilder,
	GuildMember,
	InteractionContextType,
	MessageFlags,
	User
} from 'discord.js';

@ApplyOptions<Command.Options>({
	description: 'Get the avatar of a user.'
})
export class AvatarCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
			integrationTypes: [ApplicationIntegrationType.GuildInstall],
			contexts: [InteractionContextType.Guild],
			options: [
				{
					name: 'user',
					description: 'The user to get the avatar of.',
					type: 6,
					required: false
				}
			]
		});

		registry.registerContextMenuCommand({
			name: 'Avatar',
			type: ApplicationCommandType.User,
			integrationTypes: [ApplicationIntegrationType.GuildInstall],
			contexts: [InteractionContextType.Guild]
		});
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const user = await (interaction.options.getUser('user') ?? interaction.user).fetch();
		const member = await interaction.guild?.members.fetch(user.id).catch(() => undefined);

		return interaction.reply({
			embeds: [this.buildEmbed(user, member)],
			flags: MessageFlags.Ephemeral
		});
	}

	public override async contextMenuRun(interaction: Command.ContextMenuCommandInteraction) {
		if (!interaction.isUserContextMenuCommand()) return;

		const user = await interaction.targetUser.fetch();
		const member = await interaction.guild?.members.fetch(user.id).catch(() => undefined);

		return interaction.reply({
			embeds: [this.buildEmbed(user, member)],
			flags: MessageFlags.Ephemeral
		});
	}

	private buildEmbed(user: User, member?: GuildMember) {
		const globalAvatar = user.displayAvatarURL({ size: 1024, extension: 'png' });
		const serverAvatar = member?.avatarURL({ size: 1024, extension: 'png' });

		const embed = new EmbedBuilder()
			.setAuthor({ name: user.tag, iconURL: globalAvatar })
			.setColor(member?.displayColor ?? user.accentColor ?? 0x5865f2)
			.setImage(serverAvatar ?? globalAvatar);

		const links: string[] = [];

		const formats = ['png', 'jpg', 'webp'];
		if (user.avatar?.startsWith('a_')) formats.unshift('gif');

		links.push(
			`**Global:** ${formats.map((f) => `[${f.toUpperCase()}](${user.displayAvatarURL({ size: 1024, extension: f as any })})`).join(' • ')}`
		);

		if (serverAvatar) {
			const serverFormats = ['png', 'jpg', 'webp'];
			if (member?.avatar?.startsWith('a_')) serverFormats.unshift('gif');

			links.push(
				`**Server:** ${serverFormats
					.map((f) => `[${f.toUpperCase()}](${member!.avatarURL({ size: 1024, extension: f as any })})`)
					.join(' • ')}`
			);
		}

		embed.setDescription(links.join('\n'));

		return embed;
	}
}
