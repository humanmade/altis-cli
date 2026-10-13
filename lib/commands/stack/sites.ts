import type { DatabaseTables } from '../../types/api.ts';
import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.ts';
import { getApp, printJSON, printTable } from './util.ts';
import Vantage from '../../vantage.ts';

const handler = async (argv: CliArguments) => {
	const app = await getApp( argv );
	const v = new Vantage( argv.config );
	const data = await v.request(`stack/applications/${ app }/database-tables` as const );
	const sites = data.sites || [];
	if ( argv.json ) {
		printJSON( sites );
		return;
	}
	printTable( sites.map( ( { id, domain, path } ) => ( { id, domain, path } ) ) );
};

export default {
	command: 'sites [stack]',
	describe: 'List multisite sites and their IDs for an application.',
	builder: (yargs: CommandBuilder) => yargs.option( 'json', { type: 'boolean', describe: 'Print JSON output.' } ),
	handler,
} satisfies CommandDefinition;
