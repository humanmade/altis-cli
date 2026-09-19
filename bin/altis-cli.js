#!/usr/bin/env node

import chalk from 'chalk';
import inquirer from 'inquirer';
import loudRejection from 'loud-rejection';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
import updateNotifier from 'update-notifier';

import configure from '../lib/commands/index.js';
import Cache from '../lib/cache.js';
import Config from '../lib/config.js';
import {
	hasInformationalOption,
	normalizeInformationalOptions,
} from '../lib/cli-options.js';

export const main = async (argv, { configureParser = configure } = {}) => {
	// Install handlers.
	loudRejection();

	// Check updates.
	updateNotifier({ pkg }).notify();

	// Configure parser.
	const parser = await configureParser();
	const args = argv.slice(2);

	// Informational options must work before configuration is loaded or setup is required.
	if (hasInformationalOption(args)) {
		await parser.parse(normalizeInformationalOptions(args));
		return;
	}

	// Run.
	const config = new Config();
	config.cache = new Cache();
	try {
		await config.load();
	} catch (err) {
		process.stderr.write(chalk.bold(`Error loading your configuration file from\n  `) + config.path + '\n\n');
		process.stderr.write(chalk.dim('→ ') + chalk.red(err.toString()) + '\n\n');
		process.stderr.write('I can reset your configuration, but you will need to run the setup process again.' + '\n\n');

		const { reset } = await inquirer.prompt([
			{
				type: "confirm",
				name: "reset",
				message: "Reset configuration?",
				default: false,
			}
		]);
		if (!reset) {
			throw err;
		}
		process.stderr.write('\n');
		await config.reset();

	}

	if (!config.get('didSetup')) {
		if (!process.stdout.isTTY) {
			process.stderr.write('altis-cli not configured. Run `altis-cli` in an interactive terminal to set it up.\n');
			process.exit(1);
		}
		process.stderr.write(chalk.bold('Welcome to altis-cli!\n\n'));
		const { runSetup } = await inquirer.prompt([
			{
				type: "confirm",
				name: "runSetup",
				message: "Run initial setup?",
				default: true,
			}
		]);
		if (runSetup) {
			const setupModule = await import('../lib/commands/config/setup.js');
			await setupModule.default.handler({ config });
			process.stderr.write(`Run ${chalk.yellow('altis-cli config setup')} at any time to run setup.\n\n`);
			await config.set('didSetup', true);
		}
	}

	try {
		await config.cache.load();
	} catch (err) {
		await config.cache.reset();
	}

	// Parse arguments, and pass in config.
	await parser.parse(args, { config });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	main(process.argv);
}
