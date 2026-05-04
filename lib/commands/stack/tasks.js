import chalk from 'chalk';
import { fetchJSON, confirm, printJSON, printTable, streamLog } from './util.js';
import Vantage from '../../vantage.js';

const handler = async argv => {
	const v = new Vantage(argv.config);

	if (argv.action === 'cancel') {
		if (!argv.id) {
			throw new Error('Usage: altis-cli app tasks cancel <id>');
		}
		if (!argv.yes && !await confirm(`Cancel task ${argv.id}?`)) {
			console.log(chalk.yellow('Cancelled.'));
			return;
		}
		const data = await fetchJSON(v, `stack/running-tasks/${encodeURIComponent(argv.id)}`, { method: 'DELETE' });
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

	const tasks = await fetchJSON(v, 'stack/running-tasks');
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
	description: 'List, cancel, or stream running tasks.',
	builder: yargs => yargs
		.option('app', { type: 'string', description: 'Application id for task logs.' })
		.option('yes', { type: 'boolean', description: 'Skip confirmation.' })
		.option('json', { type: 'boolean', description: 'Print JSON output.' })
		.option('debug', { type: 'boolean', default: false, description: 'Enable stream debugging.' }),
	handler,
};
