const chalk = require( 'chalk' );
const inquirer = require( 'inquirer' );
const ora = require( 'ora' );

const { getStackRegion } = require( './util' );
const Vantage = require( '../../vantage' );

const INDENT = chalk.dim( '→ ' );
const PROGRESS_WIDTH = 5;

let lastStatusLine = null;

function renderStatus( status ) {
	// Erase previous status bar.
	if ( lastStatusLine ) {
		process.stderr.clearLine();
		process.stderr.write( '\r' );
	}

	// Write log.
	if ( status.log.length > 0 ) {
		process.stdout.write( status.log.join( '\n' ) + '\n' );
		status.log = [];
	}

	// Write new status bar.
	const progressChars = Math.floor( status.progress / 100 * PROGRESS_WIDTH );
	const progress = '░'.repeat( progressChars ) + '⠂'.repeat( PROGRESS_WIDTH - progressChars );
	lastStatusLine = `${ status.spinner.frame() } [${ progress }] ${ chalk.yellow( status.step ) }`;
	process.stderr.write( lastStatusLine );
}

function deploy( vantage, stack, force ) {
	console.log( `Deploying ${stack}...` );

	let url = `stack/applications/${stack}/deploys?stream=true`;
	if ( force ) {
		url += '&force=true';
	}

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

function streamLog( vantage, stack, log, debug ) {
	const status = {
		spinner: ora(),
		step: 'Starting new deploy.',
		progress: 0,
		log: [],
	};
	console.log( chalk.yellow( `Deploy started, resume later with...` ) );
	console.log( chalk.yellow( `  hm stack deploy ${stack} --resume ${log}\n` ) );

	vantage.getLogStream( { id: stack, log } ).then( stream => {
		// Render status at 30fps.
		let renderLoop = setInterval( () => renderStatus( status ), 1000 / 30 );

		stream.on( 'open', () => status.log.push( chalk.bold.yellow( 'Connected!' ) ) );
		stream.on( 'close', () => {
			// Final render.
			clearInterval( renderLoop );
			renderStatus( status );
		});

		if ( debug ) {
			stream.on( 'retry', () => status.log.push( chalk.yellow( 'Reconnecting to stream...' ) ) );
		}

		stream.on( 'data', ({ type, data }) => {
			if ( debug ) {
				console.log( `${chalk.red(type)} ${data}` );
			}
			switch ( type ) {
				case 'fail': {
					const parsed = JSON.parse( data );
					const messageLines = parsed.message.split( '\n' );
					Array.prototype.push.apply( status.log, messageLines.map( line => chalk.red( line ) ) );

					stream.destroy();
					status.spinner.fail( chalk.bold.red( 'Failed to deploy.' ) );
					break;
				}

				case 'percentComplete':
					status.progress = parseInt( data, 10 );
					break;

				case 'log':
					const parsed = JSON.parse( data );
					const delimPos = parsed.message.indexOf( '::' );
					const isErrorOutput = delimPos > 0 && parsed.message.substring( 0, delimPos ) === 'err';

					// Strip prefixes:
					const output = delimPos > 0 ? parsed.message.substring( delimPos + 2 ) : parsed.message;
					const messageLines = output.trim().split( '\n' );
					switch ( parsed.level ) {
						case 'info':
							status.step = messageLines.slice( -1 );
							Array.prototype.push.apply( status.log, messageLines.map( t => chalk.yellow( t ) ) );
							break;

						case 'debug':
							let lines = messageLines.map( line => INDENT + line );
							if ( isErrorOutput ) {
								lines = lines.map( line => chalk.red( line ) );
							}
							Array.prototype.push.apply( status.log, lines );
							break;
					}
					break;

				case 'complete':
					status.progress = 100;
					stream.destroy();
					status.spinner.succeed( chalk.bold.green( 'Complete!' ) );
					break;
			}
		});
	});
}

module.exports = function ( argv ) {
	const { config, debug, force, stack } = argv;

	getStackRegion( argv ).then( region => {
		const v = new Vantage( config, region );
		if ( argv.resume ) {
			streamLog( v, stack, argv.resume );
			return;
		}

		deploy( v, stack, force )
			.then( id => streamLog( v, stack, id, debug ) );
	} );
};
