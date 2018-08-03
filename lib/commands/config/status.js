const chalk = require( 'chalk' );
const vantage = require( '../../vantage' );

module.exports = argv => {
	const config = argv.config;
	if ( ! config.get( 'didSetup' ) ) {
		console.log( 'No configuration detected. How did you even get here?' );
		return;
	}

	const github = config.get( 'github' );
	if ( github && github.user ) {
		console.log( `${chalk.bold('GitHub')}: Logged in as ${github.user}.` );
	} else {
		console.log( `${chalk.bold('GitHub')}: Not logged in.` );
	}

	const ssh = config.get( 'ssh' );
	if ( ssh && ssh.user ) {
		console.log( chalk.bold( 'SSH:' ) );
		console.log( `  ${chalk.bold('User')}: ${ssh.user}` );
		console.log( `  ${chalk.bold('Proxy Region')}: ${ssh.proxyRegion}` );
	} else {
		console.log( `${chalk.bold('SSH')}: No settings.` );
	}

	const vantage_token = config.get( 'vantage_token' );
	if ( vantage_token ) {
		const v = new vantage( config, 'central' );
		v.fetch( '/wp-json/wp/v2/users/me' )
			.then( resp => resp.json() )
			.then( data => {
				console.log( chalk.bold( 'Vantage:' ) );
				console.log( `  ${ chalk.bold( 'User' ) }: ${ data.slug }` );
			} );
	} else {
		console.log( `${ chalk.bold( 'Vantage' ) }: Not logged in.` );
	}
};
