import type { DatabaseTables } from '../../types/api.ts';
import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.ts';
import { getApp, fetchJSON, printJSON, printTable } from './util.ts';
import Vantage from '../../vantage.ts';

const handler = async (argv: CliArguments) => {
	const app = await getApp( argv );
	const v = new Vantage( argv.config );
	const data = await fetchJSON<DatabaseTables>( v, `stack/applications/${ app }/database-tables` );
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
