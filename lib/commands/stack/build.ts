import { errorCode } from '../../types/errors.ts';
import type { TaskResult } from '../../types/api.ts';
import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.ts';
import chalk from 'chalk';
import { getApp, streamLog } from './util.ts';
import Vantage from '../../vantage.ts';

const handler = async (argv: CliArguments) => {
	const app = await getApp(argv);
	const v = new Vantage(argv.config);

	if (argv.resume) {
		streamLog(v, app, argv.resume, argv.debug);
		return;
	}

	let data;
	try {
		data = await v.request(`stack/applications/${app}/builds` as const, { query: { stream: true }, method: 'POST' });
	} catch (err) {
		if (errorCode(err) === 'not-supported') {
			throw new Error('Builds are not supported for this application type.');
		}
		throw err;
	}
	const log = typeof data === 'string' ? data : data.log || data.task_id || '';
	console.log(chalk.yellow(`Build started, resume later with:`));
	console.log(chalk.yellow(`  altis-cli app build ${app} --resume ${log}\n`));
	streamLog(v, app, log, argv.debug);
};

export default {
	command: 'build [stack]',
	describe: 'Start an application build.',
	builder: (yargs: CommandBuilder) => yargs
		.option('resume', { type: 'string', describe: 'Log ID for resuming an existing build.' })
		.option('debug', { type: 'boolean', default: false, describe: 'Enable internal debugging information.' }),
	handler,
} satisfies CommandDefinition;
