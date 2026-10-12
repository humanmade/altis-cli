import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.js';
import { getApp, fetchJSON, printJSON, printTable } from './util.js';
import Vantage from '../../vantage.js';

const handler = async (argv: CliArguments) => {
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const data = await fetchJSON<(string | { prefix: string })[] | { prefixes?: (string | { prefix: string })[]; uploads_prefixes?: (string | { prefix: string })[] }>(v, `stack/applications/${app}/uploads-prefixes`);
	const prefixes = Array.isArray(data) ? data : (data.prefixes || data.uploads_prefixes || []);
	if (argv.json) {
		printJSON(prefixes);
		return;
	}
	printTable(prefixes.map(prefix => typeof prefix === 'string' ? { prefix } : prefix));
};

export default {
	command: 'uploads-prefixes [stack]',
	describe: 'List uploads prefixes for an application.',
	builder: (yargs: CommandBuilder) => yargs.option('json', { type: 'boolean', describe: 'Print JSON output.' }),
	handler,
} satisfies CommandDefinition;
