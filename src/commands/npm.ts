import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationCommandOptionType, ApplicationIntegrationType, EmbedBuilder, InteractionContextType, MessageFlags } from 'discord.js';

interface NpmMaintainer {
	name?: string;
	email?: string;
}

interface NpmRepositoryObject {
	type?: string;
	url?: string;
}

interface NpmPackageVersion {
	name?: string;
	version?: string;
	description?: string;
	license?: string;
	homepage?: string;
	repository?: string | NpmRepositoryObject;
	dependencies?: Record<string, string>;
	engines?: {
		node?: string;
	};
}

interface NpmPackageMetadata {
	name?: string;
	maintainers?: NpmMaintainer[];
	time?: Record<string, string>;
	versions?: Record<string, NpmPackageVersion>;
	'dist-tags'?: {
		latest?: string;
		[tag: string]: string | undefined;
	};
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isNpmPackageMetadata = (value: unknown): value is NpmPackageMetadata => {
	if (!isObject(value)) return false;

	const distTags = value['dist-tags'];
	const versions = value.versions;

	return (distTags === undefined || isObject(distTags)) && (versions === undefined || isObject(versions));
};

@ApplyOptions<Command.Options>({
	description: 'Shows information about an npm package.'
})
export class NpmCommand extends Command {
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
					name: 'package',
					description: 'Name of the npm package.',
					type: ApplicationCommandOptionType.String,
					required: true
				}
			]
		});
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const packageName = interaction.options.getString('package', true).trim();

		const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
			headers: {
				Accept: 'application/json'
			}
		});

		if (!response.ok) {
			return interaction.reply({
				content: 'Package not found.',
				flags: MessageFlags.Ephemeral
			});
		}

		const data: unknown = await response.json();

		if (!isNpmPackageMetadata(data)) {
			return interaction.reply({
				content: 'Invalid npm registry response.',
				flags: MessageFlags.Ephemeral
			});
		}

		const pkg = data;
		const latestVersion = pkg['dist-tags']?.latest;
		const latest = latestVersion ? pkg.versions?.[latestVersion] : undefined;

		if (!latest) {
			return interaction.reply({
				content: 'Could not resolve the latest package version.',
				flags: MessageFlags.Ephemeral
			});
		}

		const dependenciesCount = Object.keys(latest.dependencies ?? {}).length;

		const maintainers =
			pkg.maintainers && pkg.maintainers.length > 0
				? pkg.maintainers
						.map((maintainer) => maintainer.name)
						.filter((name): name is string => Boolean(name))
						.slice(0, 5)
						.join(', ')
				: 'Unknown';

		const repositoryUrl = typeof latest.repository === 'string' ? latest.repository : (latest.repository?.url ?? null);

		const cleanRepositoryUrl = repositoryUrl?.replace(/^git\+/, '')?.replace(/\.git$/, '');

		const publishedAt = latestVersion ? pkg.time?.[latestVersion] : undefined;

		const formatDate = (value?: string) => (value ? `<t:${Math.floor(new Date(value).getTime() / 1000)}:D>` : 'Unknown');

		const embed = new EmbedBuilder()
			.setColor(0xcb3837)
			.setAuthor({
				name: 'npm Package',
				iconURL: 'https://static.npmjs.com/a258f63f/images/icons/favicon-32x32.png'
			})
			.setTitle(latest.name ?? packageName)
			.setURL(`https://www.npmjs.com/package/${encodeURIComponent(packageName)}`)
			.setDescription(latest.description ?? 'No description provided.')
			.addFields(
				{ name: 'Latest Version', value: latest.version ?? 'Unknown', inline: true },
				{ name: 'License', value: latest.license ?? 'Unknown', inline: true },
				{ name: 'Dependencies', value: String(dependenciesCount), inline: true },
				{ name: 'Node Engine', value: latest.engines?.node ?? 'Unknown', inline: true },
				{ name: 'Homepage', value: latest.homepage ?? 'None', inline: false },
				{ name: 'Repository', value: cleanRepositoryUrl ?? 'None', inline: false },
				{ name: 'Published', value: formatDate(publishedAt), inline: true },
				{ name: 'Modified', value: formatDate(pkg.time?.modified), inline: true },
				{ name: 'Maintainers', value: maintainers, inline: false }
			)
			.setFooter({
				text: 'Lura - npm Lookup'
			})
			.setTimestamp();

		return interaction.reply({
			embeds: [embed],
			allowedMentions: { parse: [] }
		});
	}
}
