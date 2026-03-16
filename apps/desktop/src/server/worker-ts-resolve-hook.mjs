/**
 * ESM resolve hook for worker threads.
 * Resolves extensionless relative imports to .ts/.tsx files.
 * This runs in the loader thread (separate from main).
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TS_EXTENSIONS = ['.ts', '.tsx', '.mts'];
// Known file extensions that should NOT be resolved as .ts
const SKIP_EXTENSIONS = /\.(js|jsx|mjs|cjs|ts|tsx|mts|cts|json|node|wasm|css|html)$/;

export function resolve(specifier, context, nextResolve) {
  // Only handle relative imports that don't already have a known file extension
  if (specifier.startsWith('.') && !SKIP_EXTENSIONS.test(specifier)) {
    const { parentURL } = context;
    if (parentURL && parentURL.startsWith('file://')) {
      const parentPath = fileURLToPath(parentURL);
      const dir = dirname(parentPath);

      for (const ext of TS_EXTENSIONS) {
        const full = join(dir, specifier + ext);
        if (existsSync(full)) {
          return nextResolve(specifier + ext, context);
        }
        // Check index file in directory
        const indexFile = join(dir, specifier, `index${ext}`);
        if (existsSync(indexFile)) {
          return nextResolve(`${specifier}/index${ext}`, context);
        }
      }
    }
  }

  return nextResolve(specifier, context);
}
