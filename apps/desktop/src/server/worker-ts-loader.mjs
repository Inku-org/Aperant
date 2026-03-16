/**
 * Registration script for worker threads.
 * Registers a custom ESM resolve hook that adds .ts extension resolution.
 */
import { register } from 'node:module';

register('./worker-ts-resolve-hook.mjs', import.meta.url);
