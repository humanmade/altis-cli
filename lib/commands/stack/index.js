const listCommand = require( './list' );
const REGIONS = require( '../../vantage' ).REGIONS;

module.exports = function ( command ) {
	// Main configuration.
	command.demandCommand( 1 );

	command.option( 'region', {
		description: 'Region to list stacks in.',
		type: 'string',
		choices: [ ...REGIONS, undefined ],
	});

	command.command(
		'backup <stack>',
		'Create a new backup for the stack.',
		subcommand => {
			subcommand.option( 'resume', {
				description: 'Log ID for resuming an existing deploy.',
				type: 'string',
			} );
			subcommand.option( 'debug', {
				description: 'Enable internal debugging information.',
				type: 'boolean',
				default: false,
			});
		},
		require( './backup' )
	);

	command.command(
		'deploy <stack>',
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
		},
		require( './deploy' )
	);
	command.command(
		'list',
		'List stacks available in our hosting.',
		subcommand => {},
		listCommand
	);
	command.command(
		'sequel <stack>',
		'Connect to stack database via Sequel Pro.',
		subcommand => {},
		require( './sequel' )
	);
	command.command(
		'ssh <stack>',
		'SSH into a stack.',
		subcommand => {},
		require( './ssh' )
	);
};
