import chalk from 'chalk';
import inquirer from 'inquirer';
import { fetchJSON, parseList, parseReplacements, streamLog } from './util.js';
import Vantage from '../../vantage.js';

const handler = async argv => {
	const { type, target } = argv;
	if (!['database', 'uploads'].includes(type) || !target) {
		throw new Error('Usage: altis-cli app import <database|uploads> <target-app> --from <source-app>');
	}
	if (!argv.from && !argv.resume) {
		throw new Error('--from <source-app> is required.');
	}

	const v = new Vantage(argv.config);
	const route = type === 'database' ? 'import-database' : 'import-uploads';

	if (argv.resume) {
		streamLog(v, target, argv.resume, argv.debug);
		return;
	}

	// Offer to resume an existing session if one exists.
	const sessions = await fetchJSON(v, `stack/applications/${target}/${route}`).catch(() => []);
	if (Array.isArray(sessions) && sessions.length > 0) {
		const { choice } = await inquirer.prompt({
			type: 'list',
			name: 'choice',
			message: 'A previous import session exists. Resume it or start a new import?',
			choices: [
				...sessions.map(s => ({
					name: `Resume: ${s.log || s.id} (${s.date || 'unknown date'})`,
					value: s.log || s.id,
				})),
				{ name: 'Start a new import', value: null },
			],
		});
		if (choice) {
			streamLog(v, target, choice, argv.debug);
			return;
		}
	}
	const body = {
		from_application: argv.from,
	};
	if (type === 'database') {
		if (argv.tables) {
			body.tables = parseList(argv.tables);
		}
		if (argv.replace) {
			body.replacements = parseReplacements(argv.replace);
		}
		if (argv.useMydumper) {
			body.use_mydumper = true;
		}
		if (argv.postSync) {
			body.post_sync = true;
		}
	} else if (argv.uploadsPath) {
		body.uploads_path = argv.uploadsPath;
	}

	const data = await fetchJSON(v, `stack/applications/${target}/${route}?stream=true`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	const log = data.log || data;
	console.log(chalk.yellow(`Import started, resume later with:`));
	console.log(chalk.yellow(`  altis-cli app import ${type} ${target} --resume ${log}\n`));
	streamLog(v, target, log, argv.debug);
};

export default {
	command: 'import <type> <target>',
	description: 'Import database or uploads from another application.',
	builder: yargs => yargs
		.option('from', { type: 'string', description: 'Source application id.' })
		.option('tables', { type: 'string', description: 'Comma-separated database table names.' })
		.option('uploads-path', { type: 'string', description: 'Uploads prefix to import.' })
		.option('replace', { type: 'string', array: true, description: 'Search-replace mapping from=to.' })
		.option('use-mydumper', { type: 'boolean', description: 'Use mydumper/myloader.' })
		.option('post-sync', { type: 'boolean', description: 'Run post-sync after database import.' })
		.option('resume', { type: 'string', description: 'Log ID for resuming an import.' })
		.option('debug', { type: 'boolean', default: false, description: 'Enable stream debugging.' }),
	handler,
};
