import chalk from 'chalk';
import { getApp, fetchJSON, streamLog } from './util.js';
import Vantage from '../../vantage.js';

const handler = async argv => {
	const app = await getApp(argv);
	const v = new Vantage(argv.config);

	if (argv.resume) {
		streamLog(v, app, argv.resume, argv.debug);
		return;
	}

	let data;
	try {
		data = await fetchJSON(v, `stack/applications/${app}/builds?stream=true`, { method: 'POST' });
	} catch (err) {
		if (err.code === 'not-supported') {
			throw new Error('Builds are not supported for this application type.');
		}
		throw err;
	}
	const log = data.log || data;
	console.log(chalk.yellow(`Build started, resume later with:`));
	console.log(chalk.yellow(`  altis-cli app build ${app} --resume ${log}\n`));
	streamLog(v, app, log, argv.debug);
};

export default {
	command: 'build [stack]',
	description: 'Start an application build.',
	builder: yargs => yargs
		.option('resume', { type: 'string', description: 'Log ID for resuming an existing build.' })
		.option('debug', { type: 'boolean', default: false, description: 'Enable internal debugging information.' }),
	handler,
};
