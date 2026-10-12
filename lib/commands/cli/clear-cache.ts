import type { CliArguments, CommandDefinition } from '../../types/cli.js';
import ora from 'ora';

export default {
	command: 'clear-cache',
	describe: 'Clear the cache file',
	handler: (argv: CliArguments) => {
		const { config } = argv;
		const status = ora('Clearing cache…').start();
		config.cache.reset().then(() => {
			status.succeed('Cleared cache');
		});
	},
} satisfies CommandDefinition;
