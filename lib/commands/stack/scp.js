import { Base64Decode, Base64Encode } from 'base64-stream';
import bytes from 'bytes';
import crypto from 'crypto';
import fs from 'fs';
import fetch from 'node-fetch';
import ora from 'ora';
import path from 'path';
import progress from 'progress-stream';
import split2 from 'split2';
import { pipeline } from 'stream/promises';
// import AWSSSMSession from '@humanmade/ssm';
import pkg from '@humanmade/ssm';
const AWSSSMSession = pkg.default;
import Vantage from '../../vantage.js';

const INITIAL_SIZE_WAIT = 700;
// Experimentally, seems to be the best that SSM can handle.
const MAX_CHUNK = 3500;
const SESSION_WIDTH = 8000;

const rawSizeToEncoded = size => 4 * Math.ceil( size / 3.0 );
const encodedSizeToRaw = size => 3 * ( size / 4 );

const shellQuote = value => `'` + String( value ).replace( /'/g, `'\\''` ) + `'`;

// Units used in the aws cli's transfer progress output.
const SIZE_UNITS = {
	Bytes: 1,
	KiB: 2 ** 10,
	MiB: 2 ** 20,
	GiB: 2 ** 30,
	TiB: 2 ** 40,
};

const getProgress = ( name, progress, isUpload = false, encoded = true ) => {
	const { percentage } = progress;
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

	const toRaw = encoded ? encodedSizeToRaw : ( size => size );
	const pct = percentage.toFixed( 1 );
	const xfered = bytes( toRaw( progress.transferred ) );
	const total = bytes( toRaw( progress.length ) );
	const speed = bytes( toRaw( progress.speed ) );
	const status = `[${ bar }] ${ pct }% (${ xfered }/${ total }, ${ speed }/s)`;
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
			let didReady = false;
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
					didReady = true;
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
				if ( ! didReady ) {
					// Never established initial connection, so failed.
					reject( new Error( 'Could not establish connection to websocket' ) );
				}
			} );
		} );
	}

	log( level, message ) {
		if ( level >= this.options.logLevel ) {
			process.stderr.write( message + '\n' );
		}
	}

	resolveDestPath( srcPath, destPath ) {
		if ( ! fs.existsSync( destPath ) ) {
			// File doesn't exist yet. We'll handle any errors later.
			return destPath;
		}

		const stats = fs.statSync( destPath );
		if ( stats.isDirectory() ) {
			// Append the filename from the src path if destPath is a directory.
			return path.resolve( destPath, path.basename( srcPath ) );
		}
		return destPath;
	}

	/**
	 * Run a command on the remote shell and capture its output and exit code.
	 *
	 * Output is delimited with unique sentinel tokens. The tokens are split
	 * with adjacent quotes ("__ALTIS_""x_B__") in the command we type, so the
	 * PTY echoing the command back never matches the assembled token.
	 */
	exec( command, options = {} ) {
		const { timeout = 30000, onOutput = null } = options;
		const id = crypto.randomBytes( 4 ).toString( 'hex' );
		const begin = `__ALTIS_${ id }_B__`;
		const end = `__ALTIS_${ id }_E__`;

		return new Promise( ( resolve, reject ) => {
			let buffer = '';
			let done = false;
			let timer = null;
			if ( timeout ) {
				timer = setTimeout( () => {
					done = true;
					reject( new Error( `remote command timed out after ${ timeout }ms` ) );
				}, timeout );
			}

			// The session has no off(), so listeners stay attached; guard
			// with `done` instead.
			this.session.on( 'output', data => {
				if ( done ) {
					return;
				}
				buffer += data;
				if ( onOutput ) {
					onOutput( data );
				}

				const endIdx = buffer.indexOf( `${ end }:` );
				if ( endIdx === -1 ) {
					return;
				}
				// Wait until the full exit code line has arrived.
				const codeMatch = buffer.substring( endIdx + end.length + 1 ).match( /^(\d+)\r?\n/ );
				const beginIdx = buffer.indexOf( begin );
				if ( ! codeMatch || beginIdx === -1 || beginIdx > endIdx ) {
					return;
				}

				done = true;
				clearTimeout( timer );
				// Normalise \r\n and bare \r (progress redraws) to newlines.
				const output = buffer
					.substring( beginIdx + begin.length, endIdx )
					.replace( /\r\n?/g, '\n' )
					.replace( /^\n/, '' );
				resolve( {
					code: parseInt( codeMatch[ 1 ], 10 ),
					output,
				} );
			} );

			this.log( LEVELS.DEBUG, `exec: ${ command }` );
			this.session.write( `echo "__ALTIS_""${ id }_B__"; { ${ command } ; } 2>&1; echo "__ALTIS_""${ id }_E__:$?"\n` );
		} );
	}

	/**
	 * Download by relaying the file through the stack's uploads bucket.
	 *
	 * The SSM agent paces shell output at ~1MB/s, so for the bulk bytes we
	 * have the remote upload to S3 and presign a short-lived URL, then
	 * download over plain HTTPS. The SSM session is only used as the
	 * control channel.
	 */
	async transferToLocalViaS3( srcPath, destPath ) {
		const name = path.basename( destPath );

		const probe = await this.exec( 'command -v aws >/dev/null 2>&1 && echo aws_ok; echo "bucket=$S3_UPLOADS_BUCKET"' );
		const bucket = ( probe.output.match( /bucket=(\S+)/ ) || [] )[ 1 ];
		if ( ! probe.output.includes( 'aws_ok' ) || ! bucket ) {
			throw new Error( 'aws cli or S3_UPLOADS_BUCKET not available on remote' );
		}

		const key = `tmp/altis-cli/${ crypto.randomBytes( 8 ).toString( 'hex' ) }/${ path.basename( srcPath ) }`;
		const s3Uri = `s3://${ bucket }/${ key }`;

		const status = new ora( `${ name }: copying to S3…` );
		if ( this.options.logLevel === LEVELS.ERROR ) {
			status.start();
		}
		try {
			// The uploads bucket is publicly readable by default, so the
			// relayed object must be explicitly private.
			let progressTail = '';
			const upload = await this.exec(
				`aws s3 cp ${ shellQuote( srcPath ) } ${ shellQuote( s3Uri ) } --acl private`,
				{
					timeout: 15 * 60 * 1000,
					onOutput: data => {
						// The cli redraws "Completed 5.1 MiB/649.0 MiB (6.2 MiB/s)
						// with 1 file(s) remaining" over itself; show the latest.
						progressTail = ( progressTail + data ).slice( -1000 );
						const updates = progressTail.match( /Completed [^\r\n]*remaining/g );
						if ( ! updates ) {
							return;
						}
						const update = updates[ updates.length - 1 ];
						const parsed = update.match( /Completed ([\d.]+) (\w+)\/([\d.]+) (\w+) \(([\d.]+) (\w+)\/s\)/ );
						if ( ! parsed ) {
							status.text = `${ name }: copying to S3… (${ update })`;
							return;
						}
						const transferred = parseFloat( parsed[ 1 ] ) * ( SIZE_UNITS[ parsed[ 2 ] ] || 1 );
						const length = parseFloat( parsed[ 3 ] ) * ( SIZE_UNITS[ parsed[ 4 ] ] || 1 );
						status.text = getProgress( `${ name } (remote→S3)`, {
							percentage: length ? 100 * transferred / length : 0,
							speed: parseFloat( parsed[ 5 ] ) * ( SIZE_UNITS[ parsed[ 6 ] ] || 1 ),
							transferred,
							length,
						}, false, false );
					},
				}
			);
			if ( upload.code !== 0 ) {
				// Drop progress redraw lines, keep the actual error.
				const error = upload.output
					.split( '\n' )
					.filter( line => line.trim() && ! /^Completed\b.*remaining$/.test( line.trim() ) )
					.join( '\n' )
					.trim();
				throw new Error( `could not copy file to S3: ${ error }` );
			}
			status.text = `${ name }: preparing download…`;

			const presign = await this.exec( `aws s3 presign ${ shellQuote( s3Uri ) } --expires-in 300` );
			const url = presign.output.trim();
			if ( presign.code !== 0 || ! url.startsWith( 'https://' ) ) {
				throw new Error( `could not presign URL: ${ url }` );
			}

			const resp = await fetch( url );
			if ( ! resp.ok ) {
				throw new Error( `S3 download failed: HTTP ${ resp.status }` );
			}

			const progressable = progress( {
				length: parseInt( resp.headers.get( 'content-length' ) || '0', 10 ),
			} );
			progressable.on( 'progress', progress => {
				status.text = getProgress( name, progress, true, false );
				if ( this.options.logLevel !== LEVELS.ERROR ) {
					this.log( LEVELS.INFO, status.text );
				}
			} );
			await pipeline( resp.body, progressable, fs.createWriteStream( destPath ) );
			status.succeed();
		} catch ( err ) {
			status.stop();
			throw err;
		} finally {
			// Best effort; a lifecycle rule on tmp/ should expire leftovers.
			await this.exec( `aws s3 rm ${ shellQuote( s3Uri ) } --only-show-errors` ).catch( () => {} );
		}
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
					// Fail on error or pipe failure.
					'set -eo pipefail',

					// Start the header.
					`echo -n \$'\\e${ HEADER_INDICATOR };'`,

					// Get size using stat.
					`stat -c 'size=%s' ${ srcPath } | tr -d '\\n'`,

					// End header, start file.
					"echo -n $'\\a'",

					// Output file.
					`base64 < ${ srcPath }`,

					// End file.
					"echo -n $'\\a'",
				];
				this.log( LEVELS.INFO, 'Sending commands' );
				this.log( LEVELS.DEBUG, JSON.stringify( commands.join( '; ' ) ) );
				this.session.on( 'disconnect', () => {
					if ( ! didStartFile ) {
						// Some sort of error occurred, likely during stat.
						// Ensure we're closed.
						status.clear();

						// Pass feedback directly to user.
						this.log( LEVELS.INFO, 'Did not start file' );
						reject( new Error( header.substring( 1 ).trimEnd() ) );
					}
				} );
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


const handler = function ( argv ) {
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

	// Validate the incoming files.
	if ( parsedSrc.type === 'local' && ! fs.existsSync( parsedSrc.path ) ) {
		console.log( `${ parsedSrc.path }: No such file or directory` );
		process.exit( 1 );
	} else if ( parsedDest.type === 'remote' && ! fs.existsSync( parsedSrc.path ) ) {
		console.log( `${ parsedSrc.path }: No such file or directory` );
		process.exit( 1 );
	}

	const stack = parsedSrc.type === 'remote' ? parsedSrc.host : parsedDest.host;

	const v = new Vantage( config );

	const status = new ora( `Connecting to ${stack}` );
	status.start();

	const url = `stack/applications/${stack}/cli/sessions`;
	v.fetch( url, { method: 'POST' } ).then( async resp => {
		// hm-stack currently returns a 500 for invalid stacks, so we have to
		// assume any failure is a 404: https://github.com/humanmade/hm-stack/issues/367
		if ( ! resp.ok ) {
			status.fail( `Invalid stack ${stack}` );
			return;
		}

		try {
			const data = await resp.json();
			const conn = new Connection( data, {
				logLevel: argv.verbose > 0 ? 3 - argv.verbose : LEVELS.ERROR,
			} );
			await conn.connect();
			status.stop();

			// Then, pass our data over the wire.
			setTimeout( async () => {
				try {
					if ( parsedSrc.type === 'local' ) {
						await conn.transferFromLocal( parsedSrc.path, parsedDest.path );
					} else {
						const destPath = conn.resolveDestPath( parsedSrc.path, parsedDest.path );
						try {
							await conn.transferToLocalViaS3( parsedSrc.path, destPath );
						} catch ( err ) {
							// Relaying via S3 is much faster, but not available on
							// every stack; fall back to streaming over SSM.
							conn.log( LEVELS.NOTICE, `S3 fast path failed (${ err.message }); falling back to direct transfer.` );
							await conn.transferToLocal( parsedSrc.path, destPath );
						}
					}

					conn.session.write( 'exit\n' );
				} catch ( err ) {
					console.log( `Unable to transfer file: ${ err.message }` );
					process.exit( 1 );
				}
			}, 1000 );
		} catch ( err ) {
			status.stop();
			console.log( `Unable to connect: ${ err.message }` );
			process.exit( 1 );
		}
	} ).catch( e => {
		status.fail( `Could not fetch details for ${stack}` );
		throw e;
	} );
};

export default {
	command: 'scp <src> <dest>',
	description: 'Copy a file to/from a stack. Remote src/dest are determined by a colon in the input, e.g. stack:/usr/src/app.',
	builder: subcommand => {
		subcommand.option('verbose', {
			alias: 'v',
			description: 'Verbose mode.',
			type: 'count',
		});
	},
	handler,
};
