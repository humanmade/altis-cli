const chalk = require( 'chalk' );
const fs = require( 'fs' );
const open = require( 'open' );
const ora = require( 'ora' );

const { getStackRegion } = require( './util' );
const Vantage = require( '../../vantage' );

module.exports = function ( argv ) {
	const { config } = argv;

	getStackRegion( argv ).then( ( { region, stack } ) => {
		const v = new Vantage( config, region );

		const status = new ora( `Fetching SPF for ${stack}@${region} (proxying via ${v.proxyRegion})` );
		status.start();

		const url = `/spf/applications/${stack}`;
		v.fetch( url ).then( resp => {
			// hm-stack currently returns a 500 for invalid stacks, so we have to
			// assume any failure is a 404: https://github.com/humanmade/hm-stack/issues/367
			if ( ! resp.ok ) {
				status.fail( `Invalid stack ${stack}` );
				return;
			}

			status.succeed( `Found Sequel Pro configuration for ${stack}, opening…` );
			const filename = `/tmp/${stack}.spf`;
			const stream = fs.createWriteStream( filename );
			resp.body.pipe( stream );
			stream.on( 'finish', () => {
				open( filename );
			} );
		}).catch( e => {
			status.fail( `Could not fetch details for ${stack}` );
			throw e;
		});
	} );
};