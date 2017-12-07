const chalk = require( 'chalk' );
const ora = require( 'ora' );

const Vantage = require( '../../vantage' );

module.exports = function ( argv ) {
	const { config, region, stack, before, after } = argv;

	const v = new Vantage( config, region );

	const status = new ora( `Fetching PHP Logs for ${ stack }@${ region } (proxying via ${ v.proxyRegion })` );
	status.start();

	if ( argv.tail ) {
		if ( argv.before || argv.after ) {
			status.fail( '--before and --after are not supported with the --tail option.' );
			return;
		}
		v.getLogStream( { id: stack, log: `${ stack }/php` } ).then( stream => {
			stream.on( 'open', () => status.succeed( chalk.bold.yellow( 'Connected!' ) ) );
			stream.on( 'close', () => {
				status.fail( `Disconnected from ${stack}` );
			} );

			stream.on( 'data', ( { type, data } ) => {
				switch ( type ) {
					case 'log':
						const parsed = JSON.parse( data );
						console.log( parsed );
						break;
				}
			} );
		} );
	} else {
		let url = `stack/applications/${ stack }/logs/php?`;
		if ( argv.before ) {
			url += `before=${ argv.before }`;
		}
		if ( argv.after ) {
			url += `after=${ argv.after }`;
		}
		v.fetch( url ).then( resp => {
			// hm-stack currently returns a 500 for invalid stacks, so we have to
			// assume any failure is a 404: https://github.com/humanmade/hm-stack/issues/367
			if ( ! resp.ok ) {
				status.fail( `Invalid stack ${stack}` );
				return;
			}
			return resp.json();
		} ).then( logs => {
			logs.map( log => console.log( log.message ) );
			status.succeed( chalk.bold.green( 'Complete!' ) );
		} ).catch( e => {
			status.fail( `Could not fetch details for ${stack}` );
			throw e;
		} );
	}
};
