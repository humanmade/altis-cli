module.exports = function ( command ) {
	command.demandCommand( 1 );

	command.command(
		'clear-cache',
		'Clear the cache file',
		() => {},
		require( './clear-cache' )
	);
};
