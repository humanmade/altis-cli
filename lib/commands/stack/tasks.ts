import type { RunningTasksResponse } from '../../types/api.ts';
import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.ts';
import chalk from 'chalk';
import { fetchJSON, confirm, printJSON, printTable, streamLog } from './util.ts';
import Vantage from '../../vantage.ts';

const handler = async (argv: CliArguments) => {
	const v = new Vantage(argv.config);

	if (argv.action === 'cancel') {
		if (!argv.id) {
			throw new Error('Usage: altis-cli app tasks cancel <id>');
		}
		if (!argv.yes && !await confirm(`Cancel task ${argv.id}?`)) {
			console.log(chalk.yellow('Cancelled.'));
			return;
		}
		const data = await fetchJSON<unknown>(v, `stack/running-tasks/${encodeURIComponent(argv.id)}`, { method: 'DELETE' });
		if (argv.json) {
			printJSON(data);
			return;
		}
		console.log(chalk.green('Task cancelled.'));
		return;
	}

	if (argv.action === 'logs') {
		if (!argv.id) {
			throw new Error('Usage: altis-cli app tasks logs <id>');
		}
		const app = argv.app || argv.stack || String(argv.id).split('/')[0];
		streamLog(v, app, argv.id, argv.debug);
		return;
	}

	const tasks = await fetchJSON<RunningTasksResponse[]>(v, 'stack/running-tasks');
	const filtered = argv.action ? tasks.filter(task => task.application === argv.action) : tasks;
	if (argv.json) {
		printJSON(filtered);
		return;
	}
	printTable(filtered.map(task => ({
		app: task.application,
		description: task.description,
		user: task.user && task.user.name ? task.user.name : task.user || '',
		date: task.date,
		log: task.log || task.id,
	})));
};

export default {
	command: 'tasks [action] [id]',
	describe: 'List, cancel, or stream running tasks.',
	builder: (yargs: CommandBuilder) => yargs
		.option('app', { type: 'string', describe: 'Application id for task logs.' })
		.option('yes', { type: 'boolean', describe: 'Skip confirmation.' })
		.option('json', { type: 'boolean', describe: 'Print JSON output.' })
		.option('debug', { type: 'boolean', default: false, describe: 'Enable stream debugging.' }),
	handler,
} satisfies CommandDefinition;
