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
		'backup [stack]',
		'Create a new backup for the stack.',
		subcommand => {
			subcommand.option( 'uploads', {
				description: 'Include uploads in the backup.\n(--no-uploads to disable)',
				type: 'boolean',
				default: true,
			} );

			subcommand.option( 'database', {
				description: 'Include database in the backup.\n(--no-database to disable)',
				type: 'boolean',
				default: true,
			} );

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
		'backups [stack]',
		'List backups for the stack.',
		subcommand => {},
		require( './backups' )
	);

	command.command(
		'deploy [stack]',
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
		'info [stack]',
		'Get information for a stack.',
		subcommand => {},
		require( './info' )
	);
	command.command(
		'list',
		'List stacks available in our hosting.',
		subcommand => {},
		listCommand
	);
	command.command(
		'sequel [stack]',
		'Connect to stack database via Sequel Pro.',
		subcommand => {},
		require( './sequel' )
	);
	command.command(
		'ssh [stack]',
		'SSH into a stack.',
		subcommand => {
			subcommand.option( 'app-server', {
				description: 'Use an app server instead of the sandbox.',
				default: false,
				type: 'boolean',
			} );
		},
		require( './ssh' )
	);
	command.command(
		'php-logs [stack]',
		'Show PHP logs for a stack.',
		subcommand => {
			subcommand.option( 'before', {
				description: 'Date to logs must be before.',
				type: 'string',
			});

			subcommand.option( 'after', {
				description: 'Date to logs must be after.',
				type: 'string',
			});

			subcommand.option( 'tail', {
				description: 'Live update log entries.',
				type: 'boolean',
			});
		},
		require( './php-logs' )
	);
};
