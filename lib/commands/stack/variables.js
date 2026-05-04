import fs from 'fs';
import chalk from 'chalk';
import { getApp, fetchJSON, confirm, printJSON, printTable } from './util.js';
import Vantage from '../../vantage.js';

function readStdin() {
	return fs.readFileSync(0, 'utf8').replace(/\n$/, '');
}

const handler = async argv => {
	const action = argv.action || 'list';
	if (!['list', 'get', 'set', 'delete'].includes(action)) {
		throw new Error('Usage: altis-cli app variables <list|get|set|delete> [app] --type app|build');
	}
	if (!['app', 'build'].includes(argv.type)) {
		throw new Error('--type must be "app" or "build".');
	}
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const base = `stack/applications/${app}/variables/${argv.type}`;

	if (action === 'list') {
		const data = await fetchJSON(v, base);
		if (argv.json) {
			printJSON(data);
			return;
		}
		printTable(data.map(item => ({
			name: item.name,
			value: item.secret ? '(secret)' : item.value,
			secret: item.secret ? 'yes' : 'no',
			modified: item.modified || item.last_modified || '',
		})));
		return;
	}

	if (!argv.name) {
		throw new Error('--name is required.');
	}

	if (action === 'get') {
		const data = await fetchJSON(v, `${base}/${encodeURIComponent(argv.name)}`);
		if (argv.json) {
			printJSON(data);
			return;
		}
		console.log(data.secret ? '(secret)' : data.value);
		return;
	}

	if (action === 'delete') {
		if (!argv.yes && !await confirm(`Delete ${argv.type} variable ${argv.name} from ${app}?`)) {
			console.log(chalk.yellow('Cancelled.'));
			return;
		}
		await fetchJSON(v, `${base}/${encodeURIComponent(argv.name)}`, { method: 'DELETE' });
		console.log(chalk.green('Variable deleted.'));
		return;
	}

	const value = argv.valueStdin ? readStdin() : argv.value;
	if (value === undefined) {
		throw new Error('--value or --value-stdin is required.');
	}
	if (value.length > 4095) {
		throw new Error('Variable values are limited to 4095 characters.');
	}
	const body = {
		name: argv.name,
		value,
		secret: !argv.noSecret,
	};
	let exists = false;
	try {
		await fetchJSON(v, `${base}/${encodeURIComponent(argv.name)}`);
		exists = true;
	} catch (err) {
		if (err.status !== 404) {
			throw err;
		}
	}
	if (exists && argv.noSecret) {
		throw new Error('Secret status cannot be changed for an existing variable.');
	}
	const data = await fetchJSON(v, exists ? `${base}/${encodeURIComponent(argv.name)}` : base, {
		method: exists ? 'PUT' : 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(exists ? { value } : body),
	});
	if (argv.json) {
		printJSON(data);
		return;
	}
	console.log(chalk.green(`Variable ${argv.name} saved.`));
};

export default {
	command: 'variables <action> [stack]',
	description: 'Manage application variables.',
	builder: yargs => yargs
		.option('type', { choices: ['app', 'build'], demandOption: true, description: 'Variable type.' })
		.option('name', { type: 'string', description: 'Variable name.' })
		.option('value', { type: 'string', description: 'Variable value.' })
		.option('value-stdin', { type: 'boolean', description: 'Read variable value from stdin.' })
		.option('no-secret', { type: 'boolean', description: 'Store value as plaintext when creating.' })
		.option('yes', { type: 'boolean', description: 'Skip confirmation.' })
		.option('json', { type: 'boolean', description: 'Print JSON output.' }),
	handler,
};
