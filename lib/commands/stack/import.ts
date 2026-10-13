import type { DatabaseImportBody, UploadsImportBody } from '../../types/api-routes.ts';
import type { ImportSession, TaskResult } from '../../types/api.ts';
import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.ts';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { parseList, parseReplacements, streamLog } from './util.ts';
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
	const sessions = await v.request(`stack/applications/${target}/${route}` as const).catch(() => []);
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
	let data;
	if (type === 'database') {
		const body: DatabaseImportBody = {
			from_application: argv.from!,
			tables: argv.tables ? parseList(argv.tables) : undefined,
			replacements: argv.replace ? parseReplacements(argv.replace) : undefined,
			use_mydumper: argv.useMydumper || undefined,
			post_sync: argv.postSync || undefined,
		};
		data = await v.request(`stack/applications/${target}/import-database`, { method: 'POST', query: { stream: true }, body });
	} else {
		if (argv.method !== undefined && argv.method !== 'diff' && argv.method !== 'legacy') throw new Error('Invalid import method.');
		const body: UploadsImportBody = { from_application: argv.from!, path: argv.uploadsPath, method: argv.method };
		data = await v.request(`stack/applications/${target}/import-uploads`, { method: 'POST', query: { stream: true }, body });
	}

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
