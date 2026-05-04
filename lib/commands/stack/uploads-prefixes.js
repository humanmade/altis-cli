import { getApp, fetchJSON, printJSON, printTable } from './util.js';
import Vantage from '../../vantage.js';

const handler = async argv => {
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const data = await fetchJSON(v, `stack/applications/${app}/uploads-prefixes`);
	const prefixes = Array.isArray(data) ? data : (data.prefixes || data.uploads_prefixes || []);
	if (argv.json) {
		printJSON(prefixes);
		return;
	}
	printTable(prefixes.map(prefix => typeof prefix === 'string' ? { prefix } : prefix));
};

export default {
	command: 'uploads-prefixes [stack]',
	description: 'List uploads prefixes for an application.',
	builder: yargs => yargs.option('json', { type: 'boolean', description: 'Print JSON output.' }),
	handler,
};
