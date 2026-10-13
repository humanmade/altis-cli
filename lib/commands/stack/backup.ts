import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.ts';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { format, parse } from 'url';
import { getStack, streamLog } from './util.ts';
import Vantage from '../../vantage.ts';

function startBackup( vantage: Vantage, stack: string, args: Record<string, string | number> ) {
	console.log( `Starting backup for ${stack}...` );

	const urlBits = parse( `stack/applications/${stack}/backups`, true );

	urlBits.query = Object.fromEntries(Object.entries({ ...args, stream: 'true' }).map(([key, value]) => [key, String(value)]));

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

const handler = function ( argv: CliArguments ) {
	const { config, debug, force } = argv;

	getStack( argv ).then( (stack: string) => {
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
			console.log( chalk.yellow( `  altis-cli.js stack backup ${stack} --resume ${id}\n` ) );
			streamLog( v, stack, id, debug );
		} );
	} );
};

export default {
	command: 'backup [stack]',
	describe: 'Create a new backup for the stack.',
	builder: (subcommand: CommandBuilder) => {
		subcommand.option('uploads', {
			describe: 'Include uploads in the backup.\n(--no-uploads to disable)',
			type: 'boolean',
			default: true,
		});
		subcommand.option('database', {
			describe: 'Include database in the backup.\n(--no-database to disable)',
			type: 'boolean',
			default: true,
		});
		subcommand.option('resume', {
			describe: 'Log ID for resuming an existing deploy.',
			type: 'string',
		});
		subcommand.option('debug', {
			describe: 'Enable internal debugging information.',
			type: 'boolean',
			default: false,
		});
	},
	handler,
} satisfies CommandDefinition;
