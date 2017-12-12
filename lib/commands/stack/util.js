const chalk = require( 'chalk' );
const inquirer = require( 'inquirer' );
const ora = require( 'ora' );

const Vantage = require( '../../vantage' );

const INDENT = chalk.dim( '→ ' );
const PROGRESS_WIDTH = 5;

module.exports = {};

module.exports.getStackRegion = argv => {
	const { config, region, stack } = argv;

	if ( region && stack ) {
		return Promise.resolve( { region, stack } );
	}

	let regionStatus;
	const statusCallback = timestamp => {
		if ( ! timestamp ) {
			regionStatus.info( `Fetching regions…` );
		} else {
			regionStatus.info( `Using cached region map, last fetched ${ new Date( timestamp ) }` );
		}
	};

	if ( stack ) {
		regionStatus = new ora( `Finding region for ${ stack }` );
		regionStatus.start();
		return Vantage.getRegion( config, stack, statusCallback ).then( region => {
			regionStatus.succeed( `Found ${ stack } in ${ region }` );
			return { region, stack };
		} );
	}

	const formatChoice = ( region, stack ) => ( {
		name:  stack,
		value: { region, stack },
		short: `${ stack }@${ region }`,
	} );

	regionStatus = new ora( `Finding available stacks` );
	return Vantage.getStacks( config, statusCallback )
		.then( regionMap => {
			const choices = [];
			if ( region ) {
				regionMap[ region ].forEach( stack => {
					choices.push( formatChoice( region, stack ) );
				} );
			} else {
				Object.keys( regionMap ).forEach( region => {
					const stacks = regionMap[ region ];
					choices.push( new inquirer.Separator( chalk.green.bold( region ) ) );
					stacks.forEach( stack => {
						choices.push( formatChoice( region, stack ) );
					} );
				} );
			}

			return inquirer.prompt( {
				type: 'list',
				name: 'fullStack',
				message: 'Select stack:',
				choices,
			} );
		} )
		.then( answers => {
			const { region, stack } = answers.fullStack;
			regionStatus.succeed( `Found ${ stack } in ${ region }` );

			return { region, stack };
		} );
};

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

module.exports.streamLog = ( vantage, stack, log, debug ) => {
	const status = {
		spinner: ora(),
		step: 'Connecting…',
		progress: 0,
		log: [],
	};

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
					status.spinner.fail( chalk.bold.red( 'Failed.' ) );
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
