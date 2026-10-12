import { execFileSync } from 'node:child_process';
import { cpSync, rmSync, chmodSync } from 'node:fs';
rmSync(new URL('../dist/', import.meta.url), { recursive: true, force: true });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc'], { stdio: 'inherit' });
cpSync(new URL('../lib/success.css', import.meta.url), new URL('../dist/lib/success.css', import.meta.url));
chmodSync(new URL('../dist/bin/altis-cli.js', import.meta.url), 0o755);
