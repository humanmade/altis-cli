module.exports = function ( command ) {
	command.demandCommand( 1 );

	command.command(
		'reset',
		'Reset configuration',
		() => {},
		require( './reset' )
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
		require( './status' )
	);
};
