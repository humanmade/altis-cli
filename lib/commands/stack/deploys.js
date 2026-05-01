import { getApp, fetchJSON, printJSON, printTable } from './util.js';
import Vantage from '../../vantage.js';

const handler = async argv => {
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const deploys = await fetchJSON(v, `stack/applications/${app}/deploys`);
	if (argv.json) {
		printJSON(deploys);
		return;
	}
	printTable(deploys.map(deploy => ({
		id: deploy.id,
		status: deploy.status,
		build: deploy.build,
		commit: (deploy.rev || '').slice(0, 8),
		description: deploy.description || '',
		date: deploy.date,
		user: deploy.user && deploy.user.name ? deploy.user.name : deploy.user || '',
	})));
};

export default {
	command: 'deploys [stack]',
	description: 'List application deploys.',
	builder: yargs => yargs.option('json', { type: 'boolean', description: 'Print JSON output.' }),
	handler,
};
