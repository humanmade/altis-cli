import { errorCode } from '../../types/errors.js';
import type { Build } from '../../types/api.js';
import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.js';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { getStack, streamLog } from './util.js';
import Vantage from '../../vantage.js';

function deploy( vantage: Vantage, stack: string, force = false, buildId: string ) {

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
			return (resp.json() as Promise<{ message?: string; code?: string }>).then( data => {
				// If this isn't a WP error, fall back to using the text instead.
				if ( ! data.message || ! data.code ) {
					return resp.text().then( text => {
						throw new Error( text );
					} );
				}

				const err = Object.assign(new Error(data.message), { code: data.code });
				throw err;
			} );
		}

		return resp.text();
	});
}

const handler = (argv: CliArguments) => {
	if (argv.action && !argv.stack) {
		argv.stack = argv.action;
	}
	const { config, debug, force } = argv;

	getStack( argv ).then( ( stack: string ) => {
		const v = new Vantage( config );

		if (argv.resume) {
			streamLog( v, stack, argv.resume, debug );
			return;
		}

		if (argv.build) {
			deploy( v, stack, force, argv.build )
				.then( id => {
					console.log( chalk.yellow( `Deploy started, resume later with...` ) );
					console.log( chalk.yellow( `  altis-cli app deploy ${ stack } --resume ${ id }\n` ) );
					streamLog( v, stack, id, debug );
				} );
			return;
		}

		const status = ora( `Loading builds for ${ stack }…` );
		status.start();

		v.fetch( `stack/applications/${ stack }/builds` )
			.then( resp => (resp.json() as Promise<Build[]>) )
			.then( builds => {
				status.succeed();

				const latest = builds.slice();
				latest.sort( ( a, b ) => {
					const aTime = new Date(a.date).getTime();
					const bTime = new Date(b.date).getTime();

					return bTime - aTime;
				});

				const rows = latest.map( row => {
					return {
						name: `${ row.source_version!.slice(0,8) } ${ chalk.grey( `(${ ( row.date ) })` ) }`,
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
				deploy( v, stack, force, row.id )
					.then( id => {
						console.log( chalk.yellow( `Deploy started, resume later with...` ) );
						console.log( chalk.yellow( `  altis-cli app deploy ${ stack } --resume ${ id }\n` ) );

						streamLog( v, stack, id, debug );
					} )
					.catch( err => {
						if ( errorCode(err) && errorCode(err) === 'already-upto-date' ) {
							console.log();
							ora( `${ chalk.bold( stack ) } is already up to date.` ).fail();

							console.log( chalk.yellow( 'You can force deployment with...' ) );
							console.log( chalk.yellow( `  altis-cli app deploy ${ stack } --force` ) );

							process.exit( 1 );
						} else {
							throw err;
						}
					} )
				} );
	} );
};
export default {
	command: 'deploy [action] [stack]',
	describe: 'Deploy a given stack.',
	builder: (subcommand: CommandBuilder) => {
		subcommand.option('debug', {
			describe: 'Enable internal debugging information.',
			type: 'boolean',
			default: false,
		});
		subcommand.option('force', {
			describe: 'Force updating, even if the stack is already deployed.',
			type: 'boolean',
			default: false,
		});
		subcommand.option('resume', {
			describe: 'Log ID for resuming an existing deploy.',
			type: 'string',
		});
		subcommand.option('build', {
			describe: 'Build ID to deploy.',
			type: 'string',
		});
	},
	handler,
} satisfies CommandDefinition;
