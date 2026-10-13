import type { ImportSession, TaskResult } from '../../types/api.ts';
import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.ts';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { fetchJSON, parseList, parseReplacements, streamLog } from './util.ts';
import Vantage from '../../vantage.ts';

const handler = async (argv: CliArguments) => {
	const { type, target } = argv;
	if (!type || !['database', 'uploads'].includes(type) || !target) {
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
	const sessions = await fetchJSON<ImportSession[]>(v, `stack/applications/${target}/${route}`).catch(() => []);
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
	const body: Record<string, unknown> = {
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
	} else {
		if (argv.uploadsPath) {
			body.uploads_path = argv.uploadsPath;
		}
		if (argv.method) {
			body.method = argv.method;
		}
	}

	const data = await fetchJSON<TaskResult | string>(v, `stack/applications/${target}/${route}?stream=true`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	const log = typeof data === 'string' ? data : data.log || data.task_id || '';
	console.log(chalk.yellow(`Import started, resume later with:`));
	console.log(chalk.yellow(`  altis-cli app import ${type} ${target} --resume ${log}\n`));
	streamLog(v, target, log, argv.debug);
};

export default {
	command: 'import <type> <target>',
	describe: 'Import database or uploads from another application.',
	builder: (yargs: CommandBuilder) => yargs
		.option('from', { type: 'string', describe: 'Source application id.' })
		.option('tables', { type: 'string', describe: 'Comma-separated database table names.' })
		.option('uploads-path', { type: 'string', describe: 'Uploads prefix to import.' })
		.option('method', { type: 'string', choices: ['diff', 'legacy'], describe: 'Import method for uploads: diff skips unchanged files, legacy copies everything.' })
		.option('replace', { type: 'string', array: true, describe: 'Search-replace mapping from=to.' })
		.option('use-mydumper', { type: 'boolean', describe: 'Use mydumper/myloader.' })
		.option('post-sync', { type: 'boolean', describe: 'Run post-sync after database import.' })
		.option('resume', { type: 'string', describe: 'Log ID for resuming an import.' })
		.option('debug', { type: 'boolean', default: false, describe: 'Enable stream debugging.' }),
	handler,
} satisfies CommandDefinition;
