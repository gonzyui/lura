import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { blue, gray, green, magenta, magentaBright, white, yellow } from 'colorette';
import { EpisodeNotifier } from '../lib/schedule/episodeNotifier';
import { NewsNotifier } from '../lib/schedule/newsNotifier';

const dev = process.env.NODE_ENV !== 'production';

@ApplyOptions<Listener.Options>({ event: 'clientReady', once: true })
export class ClientReadyListener extends Listener {
	private readonly style = dev ? yellow : blue;

	public override run() {
		this.printBanner();
		this.printStoreDebugInformation();

		const notifier = new EpisodeNotifier();
		notifier.start();

		const newsNotifier = new NewsNotifier();
		newsNotifier.start();
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

		this.container.logger.info(
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

	private styleStore(store: typeof this.container.client.stores extends Map<any, infer V> ? V : never, last: boolean) {
		return gray(`${last ? '└─' : '├─'} Loaded ${this.style(store.size.toString().padEnd(3, ' '))} ${store.name}.`);
	}
}
