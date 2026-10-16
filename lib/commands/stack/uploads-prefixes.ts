import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.ts';
import { getApp, printJSON, printTable } from './util.ts';
import Vantage from '../../vantage.ts';

const handler = async (argv: CliArguments) => {
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const data = await v.request(`stack/applications/${app}/uploads-prefixes` as const);
	const prefixes = data.prefixes;
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
