module.exports = function ( command ) {
	command.demandCommand( 1 );

	command.command(
		'open',
		'Open the repo in your browser',
		require( './open' )
	);
};
