const ora = require( 'ora' );

const Vantage = require( '../../vantage' );

module.exports = {};

module.exports.getStackRegion = argv => {
	const { config, region, stack } = argv;

	if ( region ) {
		return Promise.resolve( region );
	}
	const regionStatus = new ora( `Finding region for ${ stack }` );
	regionStatus.start();

	const statusCallback = timestamp => {
		if ( ! timestamp ) {
			regionStatus.info( `Fetching regions…` );
		} else {
			regionStatus.info( `Using cached region map, last fetched ${ new Date( timestamp ) }` );
		}
	};
	return Vantage.getRegion( config, stack, statusCallback ).then( region => {
		regionStatus.succeed( `Found ${ stack } in ${ region }` );
		return region;
	} );
};
