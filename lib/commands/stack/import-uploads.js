import chalk from 'chalk';
import inquirer from 'inquirer';
import { format, parse } from 'url';
import { getStack, streamLog } from './util.js';
import Vantage from '../../vantage.js';

function startImport( vantage, stack, args ) {
	console.log( `Importing uploads into ${ stack } from ${ args.from_application }...` );

	const urlBits = parse( `stack/applications/${ stack }/import-uploads`, true );

	urlBits.query = Object.assign(
		{},
		{
			stream: 'true',
			from_application: args.from_application,
		}
	);

	if ( args.path ) {
		urlBits.query.path = args.path;
	}

	if ( args.method ) {
		urlBits.query.method = args.method;
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

		v.fetch( `stack/applications/${ stack }` )
			.then( resp => resp.json() )
			.then( data => {
				if ( data['environment-type'] === 'production' ) {
					console.log( chalk.red.bold( `\n  WARNING: You are importing uploads into a PRODUCTION application (${ stack })` ) );
					console.log( chalk.red( '  This will overwrite files in the production uploads bucket. This action cannot be undone.\n' ) );

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
				const args = {
					from_application: argv.from,
				};

				if ( argv.path ) {
					args.path = argv.path;
				}

				if ( argv.method ) {
					args.method = argv.method;
				}

				return startImport( v, stack, args );
			} )
			.then( id => {
				console.log( chalk.yellow( `Import started, resume later with...` ) );
				console.log( chalk.yellow( `  altis-cli stack import-uploads ${ stack } --resume ${ id }\n` ) );
				streamLog( v, stack, id, debug );
			} )
			.catch( err => {
				console.error( chalk.red( `Error: ${ err.message }` ) );
				process.exit( 1 );
			} );
	} );
};

export default {
	command: 'import-uploads [stack]',
	description: 'Import uploads from another application.',
	builder: subcommand => {
		subcommand.option( 'from', {
			description: 'Source application to import uploads from.',
			type: 'string',
			demandOption: true,
		} );
		subcommand.option( 'path', {
			description: 'Relative path within uploads to sync (e.g. "2024/01" or "sites/2/2024").',
			type: 'string',
		} );
		subcommand.option( 'method', {
			description: 'Import method: "diff" skips unchanged files (faster for re-imports), "legacy" copies everything.',
			type: 'string',
			choices: [ 'diff', 'legacy' ],
		} );
		subcommand.option( 'resume', {
			description: 'Log ID for resuming an existing import.',
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
