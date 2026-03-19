/**
 * Worker thread bootstrap for web server mode.
 *
 * Instead of relying on Node 24's native --experimental-strip-types (which
 * can't handle enums) or --experimental-transform-types (which breaks
 * type-only re-exports), this bootstrap registers tsx as the ESM loader
 * so it handles ALL TypeScript compilation in the worker thread.
 *
 * The parent process passes tsx's --import hooks via execArgv, which set up
 * tsx and the electron ESM hooks. This bootstrap adds our custom .ts
 * extension resolver on top of that.
 *
 * Usage: new Worker('worker-bootstrap.mjs', {
 *   workerData: { __workerPath: '/path/to/worker.ts', ...config },
 *   execArgv: [...parentTsxFlags]
 * })
 */
import { workerData } from 'node:worker_threads';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Register our custom .ts extension resolver for extensionless imports
// (tsx doesn't resolve extensionless .ts imports in worker threads on Node 24+)
register('./worker-ts-resolve-hook.mjs', import.meta.url);

// Import the actual worker entry point
const workerPath = workerData.__workerPath;
await import(pathToFileURL(workerPath).href);
