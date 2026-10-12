import type { Build } from '../../types/api.js';
import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.js';
import { getApp, fetchJSON, printJSON, printTable } from './util.js';
import Vantage from '../../vantage.js';

const handler = async (argv: CliArguments) => {
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const builds = await fetchJSON<Build[]>(v, `stack/applications/${app}/builds`);
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
