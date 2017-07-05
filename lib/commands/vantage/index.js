const listCommand = require( './list' );

module.exports = function ( command ) {
	// Main configuration.
	command.demandCommand( 1 );

	command.option( 'region', {
		description: 'Region to list stacks in.',
		type: 'string',
		default: 'ap-southeast-2',
	});

	command.command(
		'list',
		'List stacks available in our hosting.',
		subcommand => {},
		listCommand
	);
};
