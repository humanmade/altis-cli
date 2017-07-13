const chalk = require( 'chalk' );

function resetCommand( argv ) {
	argv.config.reset().then( () => {
		console.log( 'Configuration reset.' )
	});
}

function statusCommand( argv ) {
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
}

module.exports = function ( command ) {
	command.demandCommand( 1 );

	command.command(
		'reset',
		'Reset configuration',
		() => {},
		resetCommand
	);

	command.command(
		'setup',
		'Set up configuration',
		() => {},
		require( './setup' )
	);

	command.command(
		'status',
		'Show stored configuration',
		() => {},
		statusCommand
	);
};
