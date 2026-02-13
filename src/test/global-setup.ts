/**
 * Vitest global setup: ensures better-sqlite3 is compiled for the current
 * Node.js ABI before any test files are loaded.
 *
 * This is needed because `pnpm install` runs `electron-builder install-app-deps`
 * which compiles better-sqlite3 for Electron's embedded Node (different ABI).
 * Running `pnpm dev` also rebuilds for Electron. Either of these leaves the
 * native binary incompatible with system Node used by vitest.
 *
 * The check is fast (one require attempt) and the rebuild only runs on mismatch.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

export function setup(): void {
  const require = createRequire(import.meta.url);
  try {
    // Quick probe: can the native module load in current Node?
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.close();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('NODE_MODULE_VERSION') || msg.includes('was compiled against')) {
      const abi = process.versions.modules;
      console.log(
        `\n[vitest setup] better-sqlite3 binary ABI mismatch (need ABI ${abi}). Rebuilding...`,
      );
      execSync('pnpm rebuild better-sqlite3', { stdio: 'inherit' });
      console.log('[vitest setup] Rebuild complete.\n');
    } else {
      // Some other error — let it propagate naturally when tests load the module
      console.warn('[vitest setup] better-sqlite3 probe failed:', msg);
    }
  }
}
