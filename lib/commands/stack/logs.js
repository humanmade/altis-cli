import fs from 'fs';
import chalk from 'chalk';
import { getApp, buildQuery, parseKeyValueArgs, printJSON } from './util.js';
import Vantage from '../../vantage.js';

const LOG_ROUTES = {
	php: 'logs/php',
	nginx: 'logs/nginx',
	access: 'logs/access',
	cron: 'logs/cron',
	'raw-cron': 'logs/raw-cron',
	email: 'logs/email',
	'db-general': 'logs/db-general',
	'db-error': 'logs/db-error',
	'db-slowquery': 'logs/db-slowquery',
	'es-search': 'logs/elasticsearch/search',
	'es-index': 'logs/elasticsearch/index',
	'es-error': 'logs/elasticsearch/error',
	nodejs: 'nodejs/logs/nodejs',
};
const STREAM_LOGS = new Set(['php', 'nginx', 'nodejs']);

function printLogs(logs) {
	if (!Array.isArray(logs)) {
		console.log(logs);
		return;
	}
	if (logs.length === 0) {
		console.log(chalk.grey('No results.'));
		return;
	}
	logs.forEach(log => {
		if (typeof log === 'string') {
			console.log(log);
		} else if (log.message) {
			console.log(log.message);
		} else {
			console.log(JSON.stringify(log));
		}
	});
}

function tailLog(v, app, type, debug) {
	const log = type === 'nodejs' ? `${app}/nodejs` : `${app}/${type}`;
	return v.getLogStream({ id: app, log }).then(stream => {
		stream.on('open', () => console.error(chalk.bold.yellow('Connected!')));
		stream.on('close', () => console.error(chalk.yellow(`Disconnected from ${app}`)));
		stream.on('data', ({ type: eventType, data }) => {
			if (debug) {
				console.error(`${eventType} ${data}`);
			}
			if (eventType !== 'log') {
				return;
			}
			const parsed = JSON.parse(data);
			console.log(parsed.message || JSON.stringify(parsed));
		});
	});
}

const handler = async argv => {
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const type = argv.type;

	if (!LOG_ROUTES[type]) {
		throw new Error(`Unsupported log type "${type}". Supported types: ${Object.keys(LOG_ROUTES).join(', ')}`);
	}
	if (argv.tail) {
		if (!STREAM_LOGS.has(type)) {
			throw new Error(`--tail is only supported for ${Array.from(STREAM_LOGS).join(', ')}.`);
		}
		if (argv.after || argv.before) {
			throw new Error('--tail cannot be combined with --after or --before.');
		}
		await tailLog(v, app, type, argv.debug);
		return;
	}
	if (argv.search && type === 'access') {
		throw new Error('--search is not supported for access logs. Use --filter key=value.');
	}
	if (argv.status && !['cron', 'email'].includes(type)) {
		throw new Error('--status is only supported for cron and email logs.');
	}

	const params = {
		after: argv.after,
		before: argv.before,
		filterPattern: argv.search,
		next_token: argv.nextToken,
		format: argv.format,
		download: argv.output ? true : undefined,
		filter: argv.filter ? parseKeyValueArgs(argv.filter) : undefined,
		status: argv.status,
	};
	const url = `stack/applications/${app}/${LOG_ROUTES[type]}${buildQuery(params)}`;

	if (type === 'access') {
		const resp = await v.fetch(url);
		if (!resp.ok) {
			const data = await resp.json().catch(() => ({}));
			throw new Error(data.message || resp.statusText);
		}
		if (argv.output) {
			await new Promise((resolve, reject) => {
				const output = fs.createWriteStream(argv.output);
				resp.body.pipe(output);
				resp.body.on('error', reject);
				output.on('finish', resolve);
				output.on('error', reject);
			});
			console.log(chalk.green(`Wrote ${argv.output}`));
			return;
		}
		const text = await resp.text();
		const trimmed = text.replace(/\s/g, '');
		if (trimmed === '[]') {
			console.log(chalk.grey('No results.'));
			return;
		}
		process.stdout.write(text);
		return;
	}

	const resp = await v.fetch(url);
	if (!resp.ok) {
		const errData = await resp.json().catch(() => ({}));
		throw new Error(errData.message || resp.statusText);
	}
	const data = await resp.json();
	const nextToken = resp.headers.get('X-Next-Token');
	if (argv.json) {
		printJSON(data);
	} else {
		printLogs(data);
	}
	if (nextToken) {
		console.log(chalk.dim(`\nNext page: --next-token ${nextToken}`));
	}
};

export default {
	command: 'logs [stack]',
	description: 'Show application logs.',
	builder: yargs => yargs
		.option('type', {
			description: 'Log type.',
			choices: Object.keys(LOG_ROUTES),
			demandOption: true,
		})
		.option('after', { type: 'string', description: 'Date logs must be after.' })
		.option('before', { type: 'string', description: 'Date logs must be before.' })
		.option('search', { type: 'string', description: 'CloudWatch filter pattern.' })
		.option('next-token', { type: 'string', description: 'Pagination token.' })
		.option('tail', { type: 'boolean', description: 'Live update log entries.' })
		.option('status', { choices: ['fail', 'success'], array: true, description: 'Cron/email status filter.' })
		.option('format', { choices: ['json', 'csv'], default: 'json', description: 'Access log output format.' })
		.option('filter', { type: 'string', array: true, description: 'Access log key=value filter.' })
		.option('output', { type: 'string', description: 'Write streamed access logs to a file.' })
		.option('json', { type: 'boolean', description: 'Print JSON output.' })
		.option('debug', { type: 'boolean', default: false, description: 'Enable stream debugging.' }),
	handler,
};
