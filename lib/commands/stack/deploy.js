const chalk = require( 'chalk' );
const inquirer = require( 'inquirer' );
const ora = require( 'ora' );

const { getStackRegion, streamLog } = require( './util' );
const Vantage = require( '../../vantage' );

function deploy( vantage, stack, force ) {
	console.log( `Deploying ${stack}...` );

	let url = `stack/applications/${stack}/deploys?stream=true`;
	if ( force ) {
		url += '&force=true';
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

const handler = function ( argv ) {
	const { config, debug, force } = argv;

	getStackRegion( argv ).then( ( { region, stack } ) => {
		const v = new Vantage( config, region );
		if ( argv.resume ) {
			streamLog( v, stack, argv.resume, debug );
			return;
		}

		deploy( v, stack, force )
			.then( id => {
				console.log( chalk.yellow( `Deploy started, resume later with...` ) );
				console.log( chalk.yellow( `  hm stack deploy ${ stack } --resume ${ id }\n` ) );

				streamLog( v, stack, id, debug );
			} )
			.catch( err => {
				if ( err.code && err.code === 'already-upto-date' ) {
					console.log();
					ora( `${ chalk.bold( stack ) } is already up to date.` ).fail();

					console.log( chalk.yellow( 'You can force deployment with...' ) );
					console.log( chalk.yellow( `  hm stack deploy ${ stack } --force` ) );

					process.exit( 1 );
				} else {
					throw err;
				}
			})
	} );
};
module.exports = {
    command: 'deploy [stack]',
    description: 'Deploy a given stack.',
    builder: subcommand => {
        subcommand.option( 'debug', {
            description: 'Enable internal debugging information.',
            type: 'boolean',
            default: false,
        } );

        subcommand.option( 'force', {
            description: 'Force updating, even if the stack is already deployed.',
            type: 'boolean',
            default: false,
        } );

        subcommand.option( 'resume', {
            description: 'Log ID for resuming an existing deploy.',
            type: 'string',
        } );
    },
    handler,
};
