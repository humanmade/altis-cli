import { errorStatus } from '../../types/errors.ts';
import type { Variable } from '../../types/api.ts';
import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.ts';
import fs from 'fs';
import chalk from 'chalk';
import { getApp, confirm, printJSON, printTable } from './util.ts';
import Vantage from '../../vantage.ts';

function readStdin() {
	return fs.readFileSync(0, 'utf8').replace(/\n$/, '');
}

const handler = async (argv: CliArguments) => {
	const action = argv.action || 'list';
	if (!['list', 'get', 'set', 'delete'].includes(action)) {
		throw new Error('Usage: altis-cli app variables <list|get|set|delete> [app] --type app|build');
	}
	if (!argv.type || (argv.type !== 'app' && argv.type !== 'build')) {
		throw new Error('--type must be "app" or "build".');
	}
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const base = `stack/applications/${app}/variables/${argv.type}` as const;

	if (action === 'list') {
		const data = await v.request(base);
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
		const data = await v.request(`${base}/${encodeURIComponent(argv.name)}` as const);
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
		await v.request(`${base}/${encodeURIComponent(argv.name)}` as const, { method: 'DELETE' });
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
		await v.request(`${base}/${encodeURIComponent(argv.name)}` as const);
		exists = true;
	} catch (err) {
		if (errorStatus(err) !== 404) {
			throw err;
		}
	}
	if (exists && argv.noSecret) {
		throw new Error('Secret status cannot be changed for an existing variable.');
	}
	const data = exists
		? await v.request(`${base}/${encodeURIComponent(argv.name)}` as const, { method: 'PUT', body: { value } })
		: await v.request(base, { method: 'POST', body });
	if (argv.json) {
		printJSON(data);
		return;
	}
	console.log(chalk.green(`Variable ${argv.name} saved.`));
};

export default {
	command: 'variables <action> [stack]',
	describe: 'Manage application variables.',
	builder: (yargs: CommandBuilder) => yargs
		.option('type', { choices: ['app', 'build'], demandOption: true, describe: 'Variable type.' })
		.option('name', { type: 'string', describe: 'Variable name.' })
		.option('value', { type: 'string', describe: 'Variable value.' })
		.option('value-stdin', { type: 'boolean', describe: 'Read variable value from stdin.' })
		.option('no-secret', { type: 'boolean', describe: 'Store value as plaintext when creating.' })
		.option('yes', { type: 'boolean', describe: 'Skip confirmation.' })
		.option('json', { type: 'boolean', describe: 'Print JSON output.' }),
	handler,
} satisfies CommandDefinition;
