import { container } from '@sapphire/framework';
import Redis from 'ioredis';

export interface RedisLikeClient {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<unknown>;
    del(...keys: (string | string[])[]): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    keys(pattern: string): Promise<string[]>;
}

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
    throw new Error('[AniClient] REDIS_URL is not defined.');
}

const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    connectTimeout: 10_000,
    retryStrategy: (times) => Math.min(times * 250, 2_000)
});

redis.on('connect', () => {
    container.logger.info('[AniClient] Redis connection established.');
});

redis.on('ready', () => {
    container.logger.info('[AniClient] Redis is ready.');
});

redis.on('error', (error) => {
    container.logger.error('[AniClient] Redis error:', error);
});

async function ensureConnection() {
    if (redis.status === 'wait') {
        await redis.connect();
    }
}

const flattenKeys = (keys: (string | string[])[]) =>
    keys.flatMap((key) => (Array.isArray(key) ? key : [key]));

const redisLikeClient: RedisLikeClient = {
    async get(key) {
        await ensureConnection();
        return redis.get(key);
    },

    async set(key, value) {
        await ensureConnection();
        return redis.set(key, value);
    },

    async del(...keys) {
        await ensureConnection();
        const flatKeys = flattenKeys(keys);
        if (flatKeys.length === 0) return 0;
        return redis.del(...flatKeys);
    },

    async expire(key, seconds) {
        await ensureConnection();
        return redis.expire(key, seconds);
    },

    async keys(pattern) {
        await ensureConnection();
        return redis.keys(pattern);
    }
};

export { redis, redisLikeClient };
export default redisLikeClient;