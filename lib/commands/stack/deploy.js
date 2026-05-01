import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { getStack, streamLog, fetchJSON, confirm } from './util.js';
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

async function unlock(argv) {
	const stack = await getStack(argv);
	if (!argv.yes && !await confirm(`Unlock deploys for ${stack}?`)) {
		console.log(chalk.yellow('Cancelled.'));
		return;
	}
	const v = new Vantage(argv.config);
	const data = await fetchJSON(v, `stack/applications/${stack}/deploys/locks`, { method: 'DELETE' });
	if (data && typeof data === 'object') {
		console.log(chalk.green(`Unlocked. Build lock: ${data.build ? 'released' : 'none'}, deploy lock: ${data.deploy ? 'released' : 'none'}.`));
		return;
	}
	console.log(chalk.green('Deploy locks released.'));
}

const handler = argv => {
	if (argv.action === 'unlock') {
		unlock(argv);
		return;
	}
	if (argv.action && !argv.stack) {
		argv.stack = argv.action;
	}
	const { config, debug, force } = argv;

	getStack( argv ).then( ( stack ) => {
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
				deploy( v, stack, force, row.id )
					.then( id => {
						console.log( chalk.yellow( `Deploy started, resume later with...` ) );
						console.log( chalk.yellow( `  altis-cli app deploy ${ stack } --resume ${ id }\n` ) );

						streamLog( v, stack, id, debug );
					} )
					.catch( err => {
						if ( err.code && err.code === 'already-upto-date' ) {
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
		subcommand.option('build', {
			description: 'Build ID to deploy.',
			type: 'string',
		});
		subcommand.option('yes', {
			description: 'Skip confirmation for unlock.',
			type: 'boolean',
		});
	},
	handler,
};
