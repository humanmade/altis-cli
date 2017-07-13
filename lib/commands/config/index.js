function resetCommand( argv ) {
	argv.config.reset().then( () => {
		console.log( 'Configuration reset.' )
	});
}

function statusCommand( argv ) {
	const config = argv.config;
	const github = config.get( 'github' );

	if ( github && github.user ) {
		console.log( `Logged in as ${github.user}.` );
	} else {
		console.log( `Not logged in. Run a GitHub command to authenticate (like "hm issues list").` );
	}
}

module.exports = function ( command ) {
	command.demandCommand( 1 );

	command.command(
		'reset',
		'Reset GitHub tokens',
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
		'Show GitHub authentication status',
		() => {},
		statusCommand
	);
};
