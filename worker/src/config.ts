function required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
}

function positiveInteger(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;

    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer`);
    }

    return value;
}

export const config = {
    mongodbUri: required('MONGODB_URI'),
    redisHost: process.env.REDIS_HOST ?? 'localhost',
    redisPort: positiveInteger('REDIS_PORT', 6379),
    redisDb: Number(process.env.REDIS_DB ?? 0),
    openRouterApiKey: required('OPENROUTER_API_KEY'),
    openRouterModel: required('OPENROUTER_MODEL'),
    openRouterBaseUrl:
        process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    llmTimeoutMs: positiveInteger('LLM_TIMEOUT_MS', 30_000),
    concurrency: positiveInteger('WORKER_CONCURRENCY', 2),
    operationsPort: positiveInteger('WORKER_OPERATIONS_PORT', 3001),
} as const;
