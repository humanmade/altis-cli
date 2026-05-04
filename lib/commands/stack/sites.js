import { getApp, fetchJSON, printJSON, printTable } from './util.js';
import Vantage from '../../vantage.js';

const handler = async argv => {
	const app = await getApp( argv );
	const v = new Vantage( argv.config );
	const data = await fetchJSON( v, `stack/applications/${ app }/database-tables` );
	const sites = data.sites || [];
	if ( argv.json ) {
		printJSON( sites );
		return;
	}
	printTable( sites.map( ( { id, domain, path } ) => ( { id, domain, path } ) ) );
};

export default {
	command: 'sites [stack]',
	description: 'List multisite sites and their IDs for an application.',
	builder: yargs => yargs.option( 'json', { type: 'boolean', description: 'Print JSON output.' } ),
	handler,
};
