import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.js';
import chalk from 'chalk';
import { getApp, fetchJSON, confirm } from './util.js';
import Vantage from '../../vantage.js';

const handler = async (argv: CliArguments) => {
	if (argv.action !== 'clear') {
		throw new Error('Usage: altis-cli app build-cache clear [app]');
	}
	const app = await getApp(argv);
	if (!argv.yes && !await confirm(`Clear build cache for ${app}?`)) {
		console.log(chalk.yellow('Cancelled.'));
		return;
	}
	const v = new Vantage(argv.config);
	await fetchJSON<unknown>(v, `stack/applications/${app}/builds/build-cache`, { method: 'DELETE' });
	console.log(chalk.green('Build cache cleared.'));
};

export default {
	command: 'build-cache <action> [stack]',
	describe: 'Manage application build cache.',
	builder: (yargs: CommandBuilder) => yargs.option('yes', { type: 'boolean', describe: 'Skip confirmation.' }),
	handler,
} satisfies CommandDefinition;
