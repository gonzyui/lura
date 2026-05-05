import { AniListClient, RedisCache } from 'ani-client';
import redisLikeClient from './database/redis';

export default class AnilistClient {
	private static instance: AnilistClient;
	private aniClient: AniListClient;

	private constructor() {
		this.aniClient = new AniListClient({
			cacheAdapter: new RedisCache({
				client: redisLikeClient,
				prefix: 'ani-client:',
				ttl: 86_400,
			}),
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
