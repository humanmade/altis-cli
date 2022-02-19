const chalk = require( 'chalk' );
const inquirer = require( 'inquirer' );
const ora = require( 'ora' );
const { format, parse } = require( 'url' );

const { getStack, streamLog } = require( './util' );
const Vantage = require( '../../vantage' );

function startBackup( vantage, stack, args ) {
	console.log( `Starting backup for ${stack}...` );

	const urlBits = parse( `stack/applications/${stack}/backups`, true );

	urlBits.query = Object.assign(
		{},
		args,
		{ stream: 'true' }
	);

	const url = format( urlBits );

	const opts = { method: 'POST' };
	return vantage.fetch( url, opts ).then( resp => {
		return resp.text().then( text => {
			if ( ! resp.ok ) {
				throw new Error( text );
			}

			return text;
		});
	});
}

const handler = function ( argv ) {
	const { config, debug, force } = argv;

	getStack( argv ).then( stack => {
		const v = new Vantage( config );
		if ( argv.resume ) {
			streamLog( v, stack, argv.resume, debug );
			return;
		}

		const opts = {
			database: argv.database ? 1 : 0,
			uploads:  argv.uploads  ? 1 : 0,
		};
		startBackup( v, stack, opts ).then( id => {
			console.log( chalk.yellow( `Backup started, resume later with...` ) );
			console.log( chalk.yellow( `  hm stack backup ${stack} --resume ${id}\n` ) );
			streamLog( v, stack, id, debug );
		} );
	} );
};

module.exports = {
    command: 'backup [stack]',
    description: 'Create a new backup for the stack.',
    builder: subcommand => {
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
        } );
    },
    handler,
};
