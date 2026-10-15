import type { Deploy } from '../../types/api.ts';
import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.ts';
import { getApp, fetchJSON, printJSON, printTable } from './util.ts';
import Vantage from '../../vantage.ts';

const handler = async (argv: CliArguments) => {
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const deploys = await fetchJSON<Deploy[]>(v, `stack/applications/${app}/deploys`);
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
		user: typeof deploy.user === 'object' ? deploy.user.name : deploy.user || '',
	})));
};

export default {
	command: 'deploys [stack]',
	describe: 'List application deploys.',
	builder: (yargs: CommandBuilder) => yargs.option('json', { type: 'boolean', describe: 'Print JSON output.' }),
	handler,
} satisfies CommandDefinition;
