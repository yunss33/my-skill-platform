import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// Store downloaded browser binaries under the repo to avoid cluttering the user profile cache.
const browsersPath = path.join(repoRoot, '工程依赖', 'Playwright', 'browsers');

const bin = process.platform === 'win32'
  ? path.join(repoRoot, 'node_modules', '.bin', 'playwright.cmd')
  : path.join(repoRoot, 'node_modules', '.bin', 'playwright');

const args = process.argv.slice(2);
if (args.length === 0) {
  // Keep this terse: this script is mainly invoked via npm scripts.
  console.error('Usage: node scripts/playwright.mjs <playwright args...>');
  process.exit(1);
}

const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath };
const res = spawnSync(bin, args, { stdio: 'inherit', env });

process.exit(res.status ?? 1);

