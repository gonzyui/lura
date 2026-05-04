import { AniListClient } from 'ani-client';

export default class AnilistClient {
	private static instance: AnilistClient;
	private aniClient: AniListClient;

	private constructor() {
		this.aniClient = new AniListClient({
			cache: {
				enabled: true,
				ttl: 60 * 60 * 24 * 14 * 1000,
				maxSize: 500,
				staleWhileRevalidateMs: 60 * 60 * 24 * 7 * 1000
			},
			rateLimit: {
				enabled: true,
				maxRequests: 30,
				maxRetries: 3
			}
		});
	}

	public static getInstance(): AnilistClient {
		if (!AnilistClient.instance) {
			AnilistClient.instance = new AnilistClient();
		}
		return AnilistClient.instance;
	}

	public getAniClient(): AniListClient {
		return this.aniClient;
	}
}
