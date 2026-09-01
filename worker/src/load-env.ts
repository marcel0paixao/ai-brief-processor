import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';

const workerDirectory = resolve(__dirname, '..');
const projectDirectory = resolve(workerDirectory, '..');

// Keep provider credentials worker-scoped while sharing infrastructure values.
// Existing process variables always take precedence over local files.
loadDotenv({ path: resolve(workerDirectory, '.env'), quiet: true });
loadDotenv({ path: resolve(projectDirectory, '.env'), quiet: true });
