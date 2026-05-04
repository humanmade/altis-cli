import fs from 'fs';
import chalk from 'chalk';
import { getApp, fetchJSON, confirm, printJSON, printTable } from './util.js';
import Vantage from '../../vantage.js';

function readValues(file, inline = []) {
	const values = Array.isArray(inline) ? inline.slice() : inline ? [inline] : [];
	if (file) {
		values.push(...fs.readFileSync(file, 'utf8').split(/\r?\n/));
	}
	return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function printDiff(current, next) {
	const currentSet = new Set(current);
	const nextSet = new Set(next);
	next.filter(item => !currentSet.has(item)).forEach(item => console.log(chalk.green(`+ ${item}`)));
	current.filter(item => !nextSet.has(item)).forEach(item => console.log(chalk.red(`- ${item}`)));
}

const handler = async argv => {
	const action = argv.action || 'get';
	if (!['get', 'set'].includes(action)) {
		throw new Error('Usage: altis-cli app ip-list <get|set> [app] --type allow|deny');
	}
	if (!['allow', 'deny'].includes(argv.type)) {
		throw new Error('--type must be "allow" or "deny".');
	}
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const url = `stack/applications/${app}/iplists/${argv.type}`;

	const fetchIPList = async () => {
		try {
			return await fetchJSON(v, url);
		} catch (err) {
			if (err.code === 'feature_disabled') {
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
	const data = await fetchJSON(v, url, {
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
	description: 'Manage IP allow and deny lists.',
	builder: yargs => yargs
		.option('type', { choices: ['allow', 'deny'], demandOption: true, description: 'IP list type.' })
		.option('ip', { type: 'string', array: true, description: 'IP address or CIDR. Repeatable.' })
		.option('file', { type: 'string', description: 'File with newline-delimited IPs.' })
		.option('yes', { type: 'boolean', description: 'Skip confirmation.' })
		.option('json', { type: 'boolean', description: 'Print JSON output.' }),
	handler,
};
