import { errorCode } from '../../types/errors.js';
import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.js';
import fs from 'fs';
import chalk from 'chalk';
import { getApp, fetchJSON, confirm, printJSON, printTable } from './util.js';
import Vantage from '../../vantage.js';

function readValues(file: string | undefined, inline: string | (string | number)[] = []) {
	const values = Array.isArray(inline) ? inline.slice() : inline ? [inline] : [];
	if (file) {
		values.push(...fs.readFileSync(file, 'utf8').split(/\r?\n/));
	}
	return [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
}

function printDiff(current: string[], next: string[]) {
	const currentSet = new Set(current);
	const nextSet = new Set(next);
	next.filter(item => !currentSet.has(item)).forEach(item => console.log(chalk.green(`+ ${item}`)));
	current.filter(item => !nextSet.has(item)).forEach(item => console.log(chalk.red(`- ${item}`)));
}

const handler = async (argv: CliArguments) => {
	const action = argv.action || 'get';
	if (!['get', 'set'].includes(action)) {
		throw new Error('Usage: altis-cli app ip-list <get|set> [app] --type allow|deny');
	}
	if (!argv.type || !['allow', 'deny'].includes(argv.type)) {
		throw new Error('--type must be "allow" or "deny".');
	}
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const url = `stack/applications/${app}/iplists/${argv.type}`;

	const fetchIPList = async () => {
		try {
			return await fetchJSON<Record<string, string[]>>(v, url);
		} catch (err) {
			if (errorCode(err) === 'feature_disabled') {
				throw new Error('IP management is not enabled for this application.');
			}
			throw err;
		}
	};

	if (action === 'get') {
		const data = await fetchIPList();
		if (argv.json) {
			printJSON(data);
			return;
		}
		const values = data.ip_addresses || data;
		printTable(values.map(ip => ({ ip })));
		return;
	}

	const currentData = await fetchIPList();
	const current = currentData.ip_addresses || currentData || [];
	const next = readValues(argv.file, argv.ip);
	printDiff(current, next);
	if (!argv.yes && !await confirm(`Replace ${argv.type} IP list for ${app}?`)) {
		console.log(chalk.yellow('Cancelled.'));
		return;
	}
	const data = await fetchJSON<Record<string, string[]>>(v, url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ip_addresses: next }),
	});
	if (argv.json) {
		printJSON(data);
		return;
	}
	console.log(chalk.green('IP list updated.'));
};

export default {
	command: 'ip-list <action> [stack]',
	describe: 'Manage IP allow and deny lists.',
	builder: (yargs: CommandBuilder) => yargs
		.option('type', { choices: ['allow', 'deny'], demandOption: true, describe: 'IP list type.' })
		.option('ip', { type: 'string', array: true, describe: 'IP address or CIDR. Repeatable.' })
		.option('file', { type: 'string', describe: 'File with newline-delimited IPs.' })
		.option('yes', { type: 'boolean', describe: 'Skip confirmation.' })
		.option('json', { type: 'boolean', describe: 'Print JSON output.' }),
	handler,
} satisfies CommandDefinition;
