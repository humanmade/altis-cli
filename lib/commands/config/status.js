const chalk = require( 'chalk' );
const vantage = require( '../../vantage' );

const handler = argv => {
	const config = argv.config;
	if ( ! config.get( 'didSetup' ) ) {
		console.log( 'No configuration detected. How did you even get here?' );
		return;
	}

	const vantage_token = config.get( 'vantage_token' );
	if ( vantage_token ) {
		const v = new vantage( config );
		v.fetch( '/api/wp/v2/users/me' )
			.then( resp => resp.json() )
			.then( data => {
				console.log( chalk.bold( 'Altis Cloud:' ) );
				console.log( `  ${ chalk.bold( 'User' ) }: ${ data.slug }` );
			} );
	} else {
		console.log( `${ chalk.bold( 'Altis Cloud' ) }: Not logged in.` );
	}
};

module.exports = {
    command: 'status',
    description: 'Show stored configuration',
	handler,
};
