import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import type { StoreRegistryValue } from '@sapphire/pieces';
import { blue, gray, green, magenta, magentaBright, white, yellow } from 'colorette';
import AnilistClient from '../lib/aniClient';
import { AiringSort } from 'ani-client';
import {
	ActionRowBuilder,
	ActivityType,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	MessageFlags,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	ThumbnailBuilder
} from 'discord.js';

const dev = process.env.NODE_ENV !== 'production';

@ApplyOptions<Listener.Options>({ event: 'clientReady', once: false })
export class ClientReadyListener extends Listener {
	private readonly style = dev ? yellow : blue;

	public override run() {
		this.printBanner();
		this.printStoreDebugInformation();

		let lastChecked = Math.floor(Date.now() / 1000) - 3600;

		setInterval(async () => {
			this.container.logger.info('[AniClient] Interval tick.');

			try {
				const notif = await AnilistClient.getInstance()
					.getAniClient()
					.getAiredEpisodes({
						airingAtGreater: lastChecked,
						sort: [AiringSort.TIME_DESC],
						perPage: 15
					});

				this.container.logger.info(`[AniClient] API returned ${notif.results?.length ?? 0} results.`);

				if (notif.results && notif.results.length > 0) {
					lastChecked = Math.floor(Date.now() / 1000);

					const channel = this.container.client.channels.cache.get(process.env.NEWS_CHANNEL as string);
					if (!channel || !channel.isSendable()) return;

					for (const schedule of notif.results) {
						const media = schedule.media;
						const title = media.title.english || media.title.native || media.title.romaji || 'Unknown title';

						let description =
							media.description
								?.replace(/<[^>]*>/g, '')
								.replace(/\s+/g, ' ')
								.trim() || 'No synopsis available.';
						if (description.length > 700) {
							description = `${description.slice(0, 697)}...`;
						}

						const headerLine = [`## New episode released`, `# ${title}`].join('\n');

						const detailsLine = [
							`**Episode:** ${schedule.episode ?? 'Unknown'}`,
							media.format ? `**Format:** ${media.format}` : null,
							media.status ? `**Status:** ${media.status}` : null
						]
							.filter(Boolean)
							.join(' • ');

						const container = new ContainerBuilder().setAccentColor(0xff1a64);

						container.addSectionComponents(
							new SectionBuilder()
								.addTextDisplayComponents(
									new TextDisplayBuilder().setContent(headerLine),
									new TextDisplayBuilder().setContent([detailsLine, description].filter(Boolean).join('\n\n'))
								)
								.setThumbnailAccessory(
									new ThumbnailBuilder()
										.setURL(media.coverImage?.extraLarge || media.coverImage?.large || '')
										.setDescription(`Cover image of ${title}`)
								)
						);

						if (media.bannerImage) {
							container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

							container.addMediaGalleryComponents(
								new MediaGalleryBuilder().addItems(
									new MediaGalleryItemBuilder().setURL(media.bannerImage).setDescription(`Banner image of ${title}`)
								)
							);
						}

						container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

						container.addTextDisplayComponents(
							new TextDisplayBuilder().setContent(
								[
									`**Popularity:** ${media.popularity ?? 'Unknown'}`,
									`**Score:** ${media.averageScore ?? 'Unknown'}`,
									`**Favorites:** ${media.favourites ?? 'Unknown'}`
								].join('\n')
							)
						);

						const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
							new ButtonBuilder()
								.setStyle(ButtonStyle.Link)
								.setLabel('View on AniList')
								.setURL(media.siteUrl || 'https://anilist.co')
						);

						await channel.send({
							flags: MessageFlags.IsComponentsV2,
							components: [container, row],
							allowedMentions: { parse: [] }
						});

						this.container.logger.info(`[AniClient] New episode of ${title} has been released!`);
					}

					this.container.client.user?.setActivity({
						name: `Episode ${notif.results[0].episode} of ${notif.results[0].media.title.english || notif.results[0].media.title.native || notif.results[0].media.title.romaji} | ${process.env.PREFIX}help`,
						type: ActivityType.Watching
					});
				}
			} catch (error) {
				this.container.logger.error('[AniClient] Error fetching episodes:', error);
			}
		}, 15000);
	}

	private printBanner() {
		const success = green('+');

		const llc = dev ? magentaBright : white;
		const blc = dev ? magenta : blue;

		const line01 = llc(' _ _       _ _  ');
		const line02 = llc('| | |     | | | ');
		const line03 = llc('| |_|____ | |_|');
		const line04 = llc('|              |');
		const line05 = llc(' \            / ');
		const line06 = llc('  \          /  ');
		const line07 = llc('   \________/   ');

		const pad = ' '.repeat(7);

		console.log(
			String.raw`
${line01}
${line02}
${line03}
${line04}${pad}${blc('1.0.0')}
${line05}${pad}[${success}] Gateway
${line06}${dev ? ` ${pad}${blc('<')}${llc('/')}${blc('>')} ${llc('DEVELOPMENT MODE')}` : ''}
${line07} ${pad}
		`.trim()
		);
	}

	private printStoreDebugInformation() {
		const { client, logger } = this.container;
		const stores = [...client.stores.values()];
		const last = stores.pop()!;

		for (const store of stores) logger.info(this.styleStore(store, false));
		logger.info(this.styleStore(last, true));
	}

	private styleStore(store: StoreRegistryValue, last: boolean) {
		return gray(`${last ? '└─' : '├─'} Loaded ${this.style(store.size.toString().padEnd(3, ' '))} ${store.name}.`);
	}
}
