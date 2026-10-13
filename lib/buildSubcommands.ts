import { fileURLToPath, pathToFileURL } from 'node:url';
import type { CommandDefinition } from './types/cli.ts';
import fs from 'fs';
import path from 'path';

const extension = path.extname(fileURLToPath(import.meta.url));

function getIndexes(root: string) {
	const avail: string[] = [];
	fs.readdirSync(root).sort().forEach(function (filename) {
		const abs = path.join(root, filename);
		if (!fs.statSync(abs).isDirectory()) {
			// Files in this directory.
			if (filename === `index${extension}` || filename.endsWith('.d.ts') || !filename.endsWith(extension)) {
				return;
			}
			avail.push(abs);
			return;
		}
		// Check for index.
		const indexPath = path.join(abs, `index${extension}`);
		if (!fs.existsSync(indexPath)) {
			return;
		}
		avail.push(indexPath);
	});
	return avail;
}

export default async function buildSubcommands(dir: string) {
	const commands: CommandDefinition[] = [];
	for (const indexPath of getIndexes(dir)) {
		// Use dynamic import for ESM
		const mod = await import(pathToFileURL(indexPath).href);
		const cmd = mod.default || mod;
		// Only add if it looks like a yargs command (has 'command' property)
		if (cmd && typeof cmd === 'object' && 'command' in cmd) {
			commands.push(cmd);
		}
	}
	return commands;
}
