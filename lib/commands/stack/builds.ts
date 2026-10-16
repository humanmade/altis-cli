import type { Build } from '../../types/api.ts';
import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.ts';
import { getApp, printJSON, printTable } from './util.ts';
import Vantage from '../../vantage.ts';

const handler = async (argv: CliArguments) => {
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const builds = await v.request(`stack/applications/${app}/builds` as const);
	if (argv.json) {
		printJSON(builds);
		return;
	}
	const rows = builds.map(build => ({
		id: build.id,
		status: build.status,
		commit: (build.source_version || build.rev || '').slice(0, 8),
		date: build.date,
	}));
	printTable(rows);
};

export default {
	command: 'builds [stack]',
	describe: 'List application builds.',
	builder: (yargs: CommandBuilder) => yargs.option('json', { type: 'boolean', describe: 'Print JSON output.' }),
	handler,
} satisfies CommandDefinition;
