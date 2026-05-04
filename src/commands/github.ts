import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationCommandOptionType, ApplicationIntegrationType, EmbedBuilder, InteractionContextType, MessageFlags } from 'discord.js';

interface GitHubOwner {
	login?: string;
	avatar_url?: string;
}

interface GitHubLicense {
	spdx_id?: string | null;
	name?: string;
}

interface GitHubRepository {
	full_name?: string;
	html_url?: string;
	description?: string | null;
	language?: string | null;
	private?: boolean;
	stargazers_count?: number;
	forks_count?: number;
	open_issues_count?: number;
	default_branch?: string;
	watchers_count?: number;
	subscribers_count?: number;
	created_at?: string;
	updated_at?: string;
	pushed_at?: string;
	owner?: GitHubOwner;
	license?: GitHubLicense | null;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isGitHubRepository = (value: unknown): value is GitHubRepository => {
	if (!isObject(value)) return false;

	return ('full_name' in value || 'html_url' in value || 'owner' in value) && (value.owner === undefined || isObject(value.owner));
};

@ApplyOptions<Command.Options>({
	description: 'Shows information about a GitHub repository.'
})
export class GithubCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		const integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];
		const contexts: InteractionContextType[] = [InteractionContextType.Guild];

		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
			integrationTypes,
			contexts,
			options: [
				{
					name: 'repository',
					description: 'Repository in the form owner/repo.',
					type: ApplicationCommandOptionType.String,
					required: true
				}
			]
		});
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const repository = interaction.options.getString('repository', true).trim();

		if (!repository.includes('/')) {
			return interaction.reply({
				content: 'Please use the format `owner/repo`.',
				flags: MessageFlags.Ephemeral
			});
		}

		const response = await fetch(`https://api.github.com/repos/${repository}`, {
			headers: {
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28'
			}
		});

		if (!response.ok) {
			return interaction.reply({
				content: 'Repository not found.',
				flags: MessageFlags.Ephemeral
			});
		}

		const data: unknown = await response.json();

		if (!isGitHubRepository(data)) {
			return interaction.reply({
				content: 'Invalid GitHub API response.',
				flags: MessageFlags.Ephemeral
			});
		}

		const repo = data;

		const formatDate = (value?: string | null) => (value ? `<t:${Math.floor(new Date(value).getTime() / 1000)}:D>` : 'Unknown');

		const embed = new EmbedBuilder()
			.setColor(0x24292f)
			.setAuthor({
				name: 'GitHub Repository',
				iconURL: 'https://github.githubassets.com/favicons/favicon.png'
			})
			.setTitle(repo.full_name ?? repository)
			.setURL(repo.html_url ?? `https://github.com/${repository}`)
			.setDescription(repo.description ?? 'No description provided.')
			.setThumbnail(repo.owner?.avatar_url ?? null)
			.addFields(
				{ name: 'Language', value: repo.language ?? 'Unknown', inline: true },
				{ name: 'License', value: repo.license?.spdx_id ?? repo.license?.name ?? 'None', inline: true },
				{ name: 'Visibility', value: repo.private ? 'Private' : 'Public', inline: true },
				{ name: 'Stars', value: String(repo.stargazers_count ?? 0), inline: true },
				{ name: 'Forks', value: String(repo.forks_count ?? 0), inline: true },
				{ name: 'Open Issues', value: String(repo.open_issues_count ?? 0), inline: true },
				{ name: 'Default Branch', value: repo.default_branch ?? 'Unknown', inline: true },
				{ name: 'Watchers', value: String(repo.subscribers_count ?? repo.watchers_count ?? 0), inline: true },
				{ name: 'Created', value: formatDate(repo.created_at), inline: true },
				{ name: 'Updated', value: formatDate(repo.updated_at), inline: true },
				{ name: 'Pushed', value: formatDate(repo.pushed_at), inline: true },
				{ name: 'Owner', value: repo.owner?.login ?? 'Unknown', inline: true }
			)
			.setFooter({
				text: 'Lura - GitHub Lookup'
			})
			.setTimestamp();

		return interaction.reply({
			embeds: [embed],
			allowedMentions: { parse: [] }
		});
	}
}
