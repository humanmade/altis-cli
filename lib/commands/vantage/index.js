const listCommand = require( './list' );
const REGIONS = require( '../../vantage' ).REGIONS;

module.exports = function ( command ) {
	// Main configuration.
	command.demandCommand( 1 );

	command.option( 'region', {
		description: 'Region to list stacks in.',
		type: 'string',
		default: 'ap-southeast-2',
		choices: REGIONS,
	});

	command.command(
		'deploy',
		'Deploy a given stack.',
		subcommand => {

			subcommand.option( 'debug', {
				description: 'Enable internal debugging information.',
				type: 'boolean',
				default: false,
			});

			subcommand.option( 'force', {
				description: 'Force updating, even if the stack is already deployed.',
				type: 'boolean',
				default: false,
			});

			subcommand.option( 'resume', {
				description: 'Log ID for resuming an existing deploy.',
				type: 'string',
			});

			subcommand.option( 'stack', {
				description: 'Stack to deploy.',
				type: 'string',
			});
		},
		require( './deploy' )
	);
	command.command(
		'list',
		'List stacks available in our hosting.',
		subcommand => {},
		listCommand
	);
};
