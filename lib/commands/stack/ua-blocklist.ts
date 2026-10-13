import { errorCode } from '../../types/errors.ts';
import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.ts';
import fs from 'fs';
import chalk from 'chalk';
import { getApp, fetchJSON, confirm, printJSON, printTable } from './util.ts';
import Vantage from '../../vantage.ts';

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
		throw new Error('Usage: altis-cli app ua-blocklist <get|set> [app]');
	}
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const url = `stack/applications/${app}/ua-blocklist`;

	const fetchUABlocklist = async () => {
		try {
			return await fetchJSON<string[] | { patterns: string[] }>(v, url);
		} catch (err) {
			if (errorCode(err) === 'feature_disabled') {
				throw new Error('User-agent blocking is not enabled for this application.');
			}
			throw err;
		}
	};

	if (action === 'get') {
		const data = await fetchUABlocklist();
		if (argv.json) {
			printJSON(data);
			return;
		}
		const values = Array.isArray(data) ? data : data.patterns;
		printTable(values.map(pattern => ({ pattern })));
		return;
	}

	const currentData = await fetchUABlocklist();
	const current = Array.isArray(currentData) ? currentData : currentData.patterns || [];
	const next = readValues(argv.file, argv.pattern);
	printDiff(current, next);
	if (!argv.yes && !await confirm(`Replace user-agent blocklist for ${app}?`)) {
		console.log(chalk.yellow('Cancelled.'));
		return;
	}
	const data = await fetchJSON<string[] | { patterns: string[] }>(v, url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ patterns: next }),
	});
	if (argv.json) {
		printJSON(data);
		return;
	}
	console.log(chalk.green('User-agent blocklist updated.'));
};

export default {
	command: 'ua-blocklist <action> [stack]',
	describe: 'Manage user-agent blocklist.',
	builder: (yargs: CommandBuilder) => yargs
		.option('pattern', { type: 'string', array: true, describe: 'User-agent pattern. Repeatable.' })
		.option('file', { type: 'string', describe: 'File with newline-delimited patterns.' })
		.option('yes', { type: 'boolean', describe: 'Skip confirmation.' })
		.option('json', { type: 'boolean', describe: 'Print JSON output.' }),
	handler,
} satisfies CommandDefinition;
