import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { getStack, streamLog } from './util.js';
import Vantage from '../../vantage.js';

function deploy( vantage, stack, force, buildId ) {

	console.log( `Deploying ${stack}...` );

	let url = `stack/applications/${stack}/deploys?stream=true`;
	if ( force ) {
		url += '&force=true';
	}

	if ( buildId ) {
		url += `&build=${ buildId }`;
	}

	const opts = { method: 'POST' };
	return vantage.fetch( url, opts ).then( resp => {
		if ( ! resp.ok ) {
			return resp.json().then( data => {
				// If this isn't a WP error, fall back to using the text instead.
				if ( ! data.message || ! data.code ) {
					return resp.text().then( text => {
						throw new Error( text );
					} );
				}

				const err = new Error( data.message );
				err.code = data.code;
				throw err;
			} );
		}

		return resp.text();
	});
}

const handler = argv => {
	const { config, debug, force } = argv;

	getStack( argv ).then( ( stack ) => {
		const v = new Vantage( config );
		v.debug = debug;

		const status = new ora( `Loading builds for ${ stack }…` );
		status.start();

		v.fetch( `stack/applications/${ stack }/builds` )
			.then( resp => resp.json() )
			.then( builds => {
				status.succeed();

				const latest = builds.slice();
				latest.sort( ( a, b ) => {
					const aTime = new Date( a.date );
					const bTime = new Date( b.date );

					return bTime - aTime;
				});

				const rows = latest.map( row => {
					return {
						name: `${ row.source_version.slice(0,8) } ${ chalk.grey( `(${ ( row.date ) })` ) }`,
						value: row,
						short: row.id,
					};
				} );

				return inquirer.prompt({
					type: 'list',
					name: 'build',
					message: 'Select build to use:',
					choices: rows,
				});
			})
			.then( choices => choices.build )
			.then( row => {
				if ( argv.resume ) {
					streamLog( v, stack, argv.resume, debug );
					return;
				}

				deploy( v, stack, force, row.id )
					.then( id => {
						console.log( chalk.yellow( `Deploy started, resume later with...` ) );
						console.log( chalk.yellow( `  altis-cli stack deploy ${ stack } --resume ${ id }\n` ) );

						streamLog( v, stack, id, debug );
					} )
					.catch( err => {
						if ( err.code && err.code === 'already-upto-date' ) {
							console.log();
							ora( `${ chalk.bold( stack ) } is already up to date.` ).fail();

							console.log( chalk.yellow( 'You can force deployment with...' ) );
							console.log( chalk.yellow( `  altis-cli stack deploy ${ stack } --force` ) );

							process.exit( 1 );
						} else {
							throw err;
						}
					} )
				} );
	} );
};
export default {
	command: 'deploy [stack]',
	description: 'Deploy a given stack.',
	builder: subcommand => {
		subcommand.option('debug', {
			description: 'Enable internal debugging information.',
			type: 'boolean',
			default: false,
		});
		subcommand.option('force', {
			description: 'Force updating, even if the stack is already deployed.',
			type: 'boolean',
			default: false,
		});
		subcommand.option('resume', {
			description: 'Log ID for resuming an existing deploy.',
			type: 'string',
		});
	},
	handler,
};
