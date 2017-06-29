const listCommand = require( './list' );

module.exports = function ( command ) {
	command.demandCommand( 1 );

	command.command(
		'list',
		'List PRS for the current repo',
		subcommand => {
			subcommand.option( 'mine', {
				default: false,
				description: 'Only include assigned PRs',
				type: 'boolean',
			});
		},
		listCommand
	);
};
