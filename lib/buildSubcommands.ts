import type { CommandDefinition } from './types/cli.js';
import fs from 'fs';
import path from 'path';

function getIndexes(root: string) {
	const avail: string[] = [];
	fs.readdirSync(root).sort().forEach(function (filename) {
		const abs = path.join(root, filename);
		if (!fs.statSync(abs).isDirectory()) {
			// Files in this directory.
			if (filename === 'index.js' || !filename.match(/\.js$/)) {
				return;
			}
			avail.push(abs);
			return;
		}
		// Check for index.
		const indexPath = path.join(abs, 'index.js');
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
		const mod = await import(pathToFileUrl(indexPath));
		const cmd = mod.default || mod;
		// Only add if it looks like a yargs command (has 'command' property)
		if (cmd && typeof cmd === 'object' && 'command' in cmd) {
			commands.push(cmd);
		}
	}
	return commands;
}

function pathToFileUrl(filePath: string) {
	const url = new URL('file://' + path.resolve(filePath));
	return url.href;
}
