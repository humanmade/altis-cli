import { getApp, fetchJSON, printJSON, printTable } from './util.js';
import Vantage from '../../vantage.js';

const handler = async argv => {
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const data = await fetchJSON(v, `stack/applications/${app}/database-tables`);
	const tables = Array.isArray(data) ? data : (data.tables || []);
	if (argv.json) {
		printJSON(tables);
		return;
	}
	printTable(tables.map(table => typeof table === 'string' ? { table } : table));
};

export default {
	command: 'database-tables [stack]',
	description: 'List database tables for an application.',
	builder: yargs => yargs.option('json', { type: 'boolean', description: 'Print JSON output.' }),
	handler,
};
