const listCommand = require( './list' );
const openCommand = require( './open' );

module.exports = function ( command ) {
	command.demandCommand( 1 );

	command.command(
		'list',
		'List issues for the current repo',
		subcommand => {
			subcommand.option( 'mine', {
				default: false,
				description: 'Only include assigned issues',
				type: 'boolean',
			});
		},
		listCommand
	);

	command.command(
		'open [number]',
		'Open an issue in your browser',
		subcommand => {},
		openCommand
	);
};
