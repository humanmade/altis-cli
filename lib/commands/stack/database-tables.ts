import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.js';
import { getApp, fetchJSON, printJSON, printTable } from './util.js';
import Vantage from '../../vantage.js';

const handler = async (argv: CliArguments) => {
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const data = await fetchJSON<string[] | { tables: string[] }>(v, `stack/applications/${app}/database-tables`);
	const tables = Array.isArray(data) ? data : (data.tables || []);
	if (argv.json) {
		printJSON(tables);
		return;
	}
	printTable(tables.map(table => typeof table === 'string' ? { table } : table));
};

export default {
	command: 'database-tables [stack]',
	describe: 'List database tables for an application.',
	builder: (yargs: CommandBuilder) => yargs.option('json', { type: 'boolean', describe: 'Print JSON output.' }),
	handler,
} satisfies CommandDefinition;
