const { Base64Decode, Base64Encode } = require( 'base64-stream' );
const bytes = require( 'bytes' );
const fs = require( 'fs' );
const ora = require( 'ora' );
const path = require( 'path' );
const progress = require( 'progress-stream' );
const split2 = require( 'split2' );

const AWSSSMSession = require( '@humanmade/ssm' ).default;

const Vantage = require( '../../vantage' );

const INITIAL_SIZE_WAIT = 700;
// Experimentally, seems to be the best that SSM can handle.
const MAX_CHUNK = 3500;
const SESSION_WIDTH = 8000;

const rawSizeToEncoded = size => 4 * Math.ceil( size / 3.0 );
const encodedSizeToRaw = size => 3 * ( size / 4 );

const getProgress = ( name, progress, isUpload = false ) => {
	const { percentage, speed } = progress;
	let bar;
	if ( isUpload ) {
		bar = '<' + Array( Math.floor( 45 * percentage / 100 ) ).join( '=' );
		while ( bar.length < 45 ) {
			bar = ' ' + bar;
		}
	} else {
		bar = Array( Math.floor( 45 * percentage / 100 ) ).join( '=' ) + '>'
		while ( bar.length < 45 ) {
			bar += ' ';
		}
	}

	const pct = percentage.toFixed( 1 );
	const xfered = bytes( encodedSizeToRaw( progress.transferred ) );
	const total = bytes( encodedSizeToRaw( progress.length ) );
	const status = `[${ bar }] ${ pct }% (${ xfered }/${ total }, ${ bytes( speed ) }/s)`;
	const spaceNeeded = 10;
	return name + ' '.repeat( spaceNeeded ) + status;
};

const parseReceiveHeader = header => {
	const parts = header.substring( 1 ).split( ';' );
	const metadata = {
		size: 0,
	};
	parts.forEach( part => {
		const [ key, value ] = part.split( '=' );
		switch ( key ) {
			case 'size':
				metadata.size = parseInt( value, 10 );
				break;
		}
	} );
	return metadata;
}

const LEVELS = {
	DEBUG: 1,
	INFO: 2,
	NOTICE: 3,
	WARNING: 4,
	ERROR: 5,
};

class Connection {
	idleTimer = null;
	connection = {};
	options = {
		logLevel: LEVELS.ERROR,
	};
	session = null;

	constructor( connection, options ) {
		this.connection = connection;
		this.options = options;
	}

	connect() {
		return new Promise( ( resolve, reject ) => {
			this.session = new AWSSSMSession( this.connection.stream_url, this.connection.aws_ssm_session_id, this.connection.token );
			this.log( LEVELS.INFO, 'Connecting to stream' );
			this.session.on( 'connect', () => {
				this.log( LEVELS.INFO, 'Connected' );
				this.session.setSize( SESSION_WIDTH, 24 );

				setTimeout( () => {
					if ( ! this.session ) {
						this.log( LEVELS.WARNING, 'Missing session' );
						return;
					}

					this.log( LEVELS.INFO, 'Ready' );
					resolve();
				}, INITIAL_SIZE_WAIT );

				// Set up our listeners.
				process.on( 'beforeExit', () => {
					this.log( LEVELS.INFO, 'Exiting' );
					this.session.close();
				} );
			} );
			this.session.on( 'disconnect', () => {
				this.log( LEVELS.INFO, 'Disconnected' );
				this.session.close();
				process.exit();
			} );
		} );
	}

	log( level, message ) {
		if ( level >= this.options.logLevel ) {
			process.stderr.write( message + '\n' );
		}
	}

	resolveDestPath( srcPath, destPath ) {
		const stats = fs.statSync( destPath );
		if ( stats.isDirectory() ) {
			// Append the filename from the src path if destPath is a directory.
			return path.resolve( destPath, path.basename( srcPath ) );
		}
		return destPath;
	}

	transferFromLocal( srcPath, destPath ) {
		return new Promise( ( resolve, reject ) => {
			const stream = fs.createReadStream( srcPath );
			const totalSize = fs.statSync( srcPath ).size;
			const name = path.basename( srcPath );

			// Establish sink.
			this.session.write( `cat - | base64 -d > ${ destPath }\n` );

			// Prepare the progress reporter.
			const status = new ora( `${ name }…` );
			status.start();
			const progressable = progress( {
				// length: totalSize,
				length: rawSizeToEncoded( totalSize ),
			} );
			progressable.on( 'progress', ( progress ) => {
				status.text = getProgress( name, progress );
			} );

			setTimeout( () => {
				// Listen for future output from the session.
				const listener = () => {
					// Resume.
					if ( piped.isPaused() ) {
						piped.resume();
					}
				};
				this.session.on( 'output', listener );

				// Stream our data and encode it.
				const piped = stream
					.pipe( new Base64Encode( {
						lineLength: MAX_CHUNK,
					} ) )
					.pipe( split2() )
					.pipe( progressable );

				piped.on( 'data', ( data ) => {
					// Split into lines, and send each.
					this.session.write( data + '\r\n' );

					// Pause the stream until we hear back.
					piped.pause();
				} );

				piped.on( 'end', () => {
					// Send EOF.
					this.session.write( '\u0004' );

					status.succeed();

					// Clean up.
					// this.session.off( 'output', listener );
					stream.close();
					resolve();
				} );
			}, 200 );
		} );
	}

	transferToLocal( srcPath, destPath ) {
		// iTerm-compatible headers.
		const HEADER_INDICATOR = ']1337';
		return new Promise( ( resolve, reject ) => {
			const fileStream = fs.createWriteStream( destPath );
			const name = path.basename( destPath );

			// Prepare the progress reporter.
			const status = new ora( `${ name }…` );
			if ( this.options.logLevel === LEVELS.ERROR ) {
				status.start();
			}
			const progressable = progress();
			progressable.on( 'progress', ( progress ) => {
				status.text = getProgress( name, progress, true );
				if ( this.options.logLevel !== LEVELS.ERROR ) {
					this.log( LEVELS.INFO, status.text );
				}
			} );

			progressable
				.pipe( new Base64Decode() )
				.pipe( fileStream );

			setTimeout( () => {
				let didStartHeader = false;
				let didStartFile = false;
				let didCompleteFile = false;
				let preheader = '';
				let header = '';
				let metadata = null;

				// Listen for future output from the session.
				const handleData = data => {
					// Look for \A to end the file.
					const endMarker = data.indexOf( '\x07' );
					if ( endMarker === -1 ) {
						// No end marker, just write the data and move on.
						// console.log( { data } );
						progressable.write( data );
						return;
					}

					// Process all remaining, then end.
					this.log( LEVELS.DEBUG, 'Found end marker' );
					const remaining = data.substring( 0, endMarker );
					progressable.end( remaining );
					fileStream.close();
					didCompleteFile = true;
					status.succeed();

					resolve();
				}

				const listener = ( data ) => {
					this.log( LEVELS.INFO, `Received ${ data.length } bytes` );
					this.log( LEVELS.DEBUG, JSON.stringify( data ) );
					if ( didCompleteFile ) {
						this.log( LEVELS.DEBUG, 'File already complete' );
						return;
					}

					if ( didStartFile ) {
						this.log( LEVELS.DEBUG, 'File data' );
						handleData( data );
						return;
					}
					if ( ! didStartHeader ) {
						this.log( LEVELS.DEBUG, 'Pre-header data' );
						preheader += data;

						// Looking for \e]1337
						const headerStart = preheader.indexOf( '\x1B' + HEADER_INDICATOR );
						if ( headerStart === -1 ) {
							return;
						}

						// Found the header, parse it.
						this.log( LEVELS.DEBUG, 'Found header marker' );
						didStartHeader = true;
						header = preheader.substring( headerStart + HEADER_INDICATOR.length + 1 );
					} else {
						this.log( LEVELS.DEBUG, 'Header data' );
						header += data;
					}

					// Looking for \A
					const dataStart = header.indexOf( '\x07' );
					if ( dataStart === -1 ) {
						return;
					}

					// Found the end of the header. Parse it, then move on.
					this.log( LEVELS.DEBUG, 'Found data marker' );
					didStartFile = true;
					const firstData = header.substring( dataStart + 1 );
					header = header.substring( 0, dataStart );
					metadata = parseReceiveHeader( header );
					if ( metadata.size ) {
						this.log( LEVELS.DEBUG, JSON.stringify( {
							size: metadata.size,
							encodedSize: rawSizeToEncoded( metadata.size ),
						} ) );
						progressable.setLength( rawSizeToEncoded( metadata.size ) );
					}

					// Handle potential first part of the file.
					handleData( firstData );
				};
				this.session.on( 'output', listener );

				// Begin transfer.
				const commands = [
					// Start the header.
					`echo -n \$'\\e${ HEADER_INDICATOR };'`,

					// Get size using stat.
					`stat -c "size=%s" ${ srcPath } | tr -d '\n'`,

					// End header, start file.
					"echo -n $'\\a'",

					// Output file.
					`base64 < ${ srcPath }`,

					// End file.
					"echo -n $'\\a'",
				];
				this.log( LEVELS.INFO, 'Sending commands' );
				this.log( LEVELS.DEBUG, JSON.stringify( commands.join( '; ' ) ) );
				this.session.write( commands.join( '; ' ) + '\n' );
			}, 1000 );
		} );
	}
}

function parsePath( path ) {
	// [user@]host:[path]
	const [ first, second ] = path.split( ':' );
	if ( ! second ) {
		// Local path instead.
		return {
			type: 'local',
			path: first,
		};
	}

	return {
		type: 'remote',
		host: first,
		path: second,
	};
}


module.exports = function ( argv ) {
	const { config, dest, src } = argv;
	const parsedSrc = parsePath( src );
	const parsedDest = parsePath( dest );
	if (
		parsedSrc.type === 'local' && parsedDest.type !== 'remote' ||
		parsedSrc.type === 'remote' && parsedDest.type !== 'local'
	) {
		process.stderr.write( 'Cannot copy local-to-local or remote-to-remote.\n' );
		process.exit( 1 );
	}

	const stack = parsedSrc.type === 'remote' ? parsedSrc.host : parsedDest.host;

	const v = new Vantage( config );

	const status = new ora( `Connecting to ${stack}` );
	status.start();

	const url = `stack/applications/${stack}/cli/sessions`;
	v.fetch( url, { method: 'POST' } ).then( resp => {
		// hm-stack currently returns a 500 for invalid stacks, so we have to
		// assume any failure is a 404: https://github.com/humanmade/hm-stack/issues/367
		if ( ! resp.ok ) {
			status.fail( `Invalid stack ${stack}` );
			return;
		}

		return resp.json().then( data => {
			status.stop();
			const conn = new Connection( data, {
				logLevel: argv.verbose > 0 ? 3 - argv.verbose : LEVELS.ERROR,
			} );
			conn.connect().then( () => {
				// Then, pass our data over the wire.
				setTimeout( async () => {
					try {
						if ( parsedSrc.type === 'local' ) {
							await conn.transferFromLocal( parsedSrc.path, parsedDest.path );
						} else {
							const destPath = conn.resolveDestPath( parsedSrc.path, parsedDest.path );
							await conn.transferToLocal( parsedSrc.path, destPath );
						}
					} catch ( err ) {
						console.log( `Unable to transfer file: ${ err.message }` );
					}

					conn.session.write( 'exit\n' );
				}, 1000 );
			} );
		});
	}).catch( e => {
		status.fail( `Could not fetch details for ${stack}` );
		throw e;
	});
};
