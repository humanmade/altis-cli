import chalk from 'chalk';
import inquirer from 'inquirer';
import { format, parse } from 'url';
import { getStack, streamLog } from './util.js';
import Vantage from '../../vantage.js';

function startImport( vantage, stack, args ) {
	console.log( `Importing database into ${ stack } from ${ args.from_application }...` );

	const urlBits = parse( `stack/applications/${ stack }/import-database`, true );

	urlBits.query = Object.assign(
		{},
		{
			stream: 'true',
			from_application: args.from_application,
			use_mydumper: args.use_mydumper ? '1' : '0',
		}
	);

	if ( args.tables ) {
		args.tables.forEach( ( table, i ) => {
			urlBits.query[ `tables[${ i }]` ] = table;
		} );
	}

	if ( args.replacements ) {
		Object.entries( args.replacements ).forEach( ( [ search, replace ] ) => {
			urlBits.query[ `replacements[${ search }]` ] = replace;
		} );
	}

	const url = format( urlBits );

	const opts = { method: 'POST' };
	return vantage.fetch( url, opts ).then( resp => {
		return resp.text().then( text => {
			if ( ! resp.ok ) {
				throw new Error( text );
			}

			return text;
		} );
	} );
}

const handler = function ( argv ) {
	const { config, debug } = argv;

	getStack( argv ).then( stack => {
		const v = new Vantage( config );
		v.debug = debug;

		if ( argv.resume ) {
			streamLog( v, stack, argv.resume, debug );
			return;
		}

		if ( ! argv.from ) {
			console.error( chalk.red( 'Error: --from is required (source application to import from)' ) );
			process.exit( 1 );
		}

		// Fetch target app info for production safety check.
		v.fetch( `stack/applications/${ stack }` )
			.then( resp => resp.json() )
			.then( data => {
				if ( data['environment-type'] === 'production' ) {
					console.log( chalk.red.bold( `\n  WARNING: You are importing a database into a PRODUCTION application (${ stack })` ) );
					console.log( chalk.red( '  This will overwrite the production database. This action cannot be undone.\n' ) );

					return inquirer.prompt( {
						type: 'confirm',
						name: 'confirm',
						message: 'Are you sure you want to continue?',
						default: false,
					} ).then( answers => {
						if ( ! answers.confirm ) {
							console.log( 'Aborted.' );
							process.exit( 0 );
						}
					} );
				}
			} )
			.then( () => {
				// Build args.
				const args = {
					from_application: argv.from,
					use_mydumper: ! argv.mysqldump,
				};

				// Parse replacements: "search1=replace1,search2=replace2"
				if ( argv.replacements ) {
					const replacements = {};
					argv.replacements.split( ',' ).forEach( pair => {
						const eqIndex = pair.indexOf( '=' );
						if ( eqIndex === -1 ) {
							console.error( chalk.red( `Invalid replacement pair: ${ pair }` ) );
							console.error( chalk.red( 'Expected format: search=replace' ) );
							process.exit( 1 );
						}
						const search = pair.substring( 0, eqIndex );
						const replace = pair.substring( eqIndex + 1 );
						replacements[ search ] = replace;
					} );
					args.replacements = replacements;
				}

				if ( argv.tables ) {
					args.tables = argv.tables.split( ',' );
				}

				return startImport( v, stack, args );
			} )
			.then( id => {
				console.log( chalk.yellow( `Import started, resume later with...` ) );
				console.log( chalk.yellow( `  altis-cli stack import-database ${ stack } --resume ${ id }\n` ) );
				streamLog( v, stack, id, debug );
			} )
			.catch( err => {
				console.error( chalk.red( `Error: ${ err.message }` ) );
				process.exit( 1 );
			} );
	} );
};

export default {
	command: 'import-database [stack]',
	description: 'Import a database from another application.',
	builder: subcommand => {
		subcommand.option( 'from', {
			description: 'Source application to import the database from.',
			type: 'string',
			demandOption: true,
		} );
		subcommand.option( 'replacements', {
			description: 'Comma-separated search=replace pairs for URL replacements.\n(e.g. https://old.com=https://new.com,https://old2.com=https://new2.com)',
			type: 'string',
		} );
		subcommand.option( 'tables', {
			description: 'Comma-separated list of specific tables to import.',
			type: 'string',
		} );
		subcommand.option( 'resume', {
			description: 'Log ID for resuming an existing import.',
			type: 'string',
		} );
		subcommand.option( 'mysqldump', {
			description: 'Use legacy mysqldump instead of mydumper.',
			type: 'boolean',
			default: false,
		} );
		subcommand.option( 'debug', {
			description: 'Enable internal debugging information.',
			type: 'boolean',
			default: false,
		} );
	},
	handler,
};
