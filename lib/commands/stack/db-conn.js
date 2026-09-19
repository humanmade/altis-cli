const EventEmitter = require( 'events' );
const fs = require( 'fs' );
const net = require( 'net' );
var stream = require( 'stream' );
const ora = require( 'ora' );

const AWSSSMSession = require( '@humanmade/ssm' ).default;
const decode = require( '@humanmade/ssm' ).decode;

const { getStack } = require( './util' );
const Vantage = require( '../../vantage' );

// Keep the socket alive by pinging every 10s.
const KEEPALIVE_INTERVAL = 10_000;
const IDLE_INTERVAL = 30_000;

const keepalive = '\x01\x03';

// const parseData = ( data ) => {
// 	const buf = Buffer.from( data );
// 	const len = buf.length;
// 	let contentLength = 0;
// 	let i = 0;
// 	for ( i = 0; i < len; i++ ) {
// 		const byte = buf[ i ];
// 		console.log( { byte } );
// 		if ( byte === 0x01 ) {
// 			// Start header
// 			continue;
// 		}
// 		if ( byte === 0x03 ) {
// 			// End header.
// 			break;
// 		}
// 		contentLength = contentLength << 1 + byte;
// 	}

// 	const content = buf.slice( i );
// 	console.log( { contentLength, act: content.length } );
// 	return {
// 		length: contentLength,
// 		data: content.toString(),
// 	};
// }

/** @param {TypedArray} value */
const hexDump = ( value ) => {
	const hex = Buffer.from( value ).toString( 'hex' );
	const groups = hex.match( /.{2}/g );
	let res = '';
	for ( let i = 0, done = 0; i < groups.length; i++ ) {
		res += groups[i];
		done++;
		if ( done >= 8 ) {
			done = 0;
			res += '\n';
		} else if ( done === 4 ) {
			res += '  ';
		} else {
			res += ' ';
		}
	}
	return res;
}

class Logger {
	_log( level, type, ...args ) {
		if ( typeof type !== 'string' ) {
			console.trace( 'Log called without valid string type' );
		}
		const mapped = args.map( arg => {
			if ( arg instanceof Uint8Array ) {
				return arg.constructor.name + '<\n  ' + hexDump( arg ).replace( /\n/g, '\n  ' ) + '\n>';
			}
			return arg;
		} );
		console.log(
			Date.now(),
			'[' + level + ']',
			type,
			...mapped
		);
	}
	debug = ( ...args ) => this._log( 'debug', ...args );
	info = ( ...args ) => this._log( 'info', ...args );
	warn = ( ...args ) => this._log( 'warn', ...args );
	error = ( ...args ) => this._log( 'error', ...args );
}

class WrappedLogger {
	parent;
	prefix;

	constructor( parent, prefix ) {
		this.parent = parent;
		this.prefix = prefix;
	}

	debug( type, ...args ) {
		this.parent.debug( `${ this.prefix }:${ type }`, ...args );
	}
	info( type, ...args ) {
		this.parent.info( `${ this.prefix }:${ type }`, ...args );
	}
	warn( type, ...args ) {
		this.parent.warn( `${ this.prefix }:${ type }`, ...args );
	}
	error( type, ...args ) {
		this.parent.error( `${ this.prefix }:${ type }`, ...args );
	}
}

class NullLogger {
	debug() {}
	info() {}
	warn() {}
	error() {}
}

class PortServer extends EventEmitter {
	session;

	/** @type {?Buffer} */
	buffer;
	bytesRead = 0;
	dataWaiting = 0;
	/** @type Logger */
	log;
	started = false;
	server;

	pauseStream = true;
	pipeStream;

	constructor( log, session ) {
		super();

		this.log = log;
		this.session = session;
		this.buffer = Buffer.alloc( 8192 );

		this.pipeStream = new stream.Duplex( {
			write: ( chunk, enc, cb ) => {
				if ( ! this.session ) {
					cb( new Error( 'Cannot write before connection is open' ) );
					return;
				}

				this.log.debug( 'client:recv', chunk );
				this.session.writeRaw( chunk );
				cb();
			},
			read: () => {
				this.pauseStream = false;
				this._maybeSend();
			},
			// read:
		} );
	}

	start() {
		if ( this.started ) {
			throw new Error( 'Cannot start server multiple times' );
		}

		this.started = true;
		this.server = net.createServer();
		this.server.on( 'connection', this.onConnect );
		this.server.on( 'error', this.onError );
		this.server.on( 'close', this.onClose );
		this.server.on( 'drop', this.onDrop );
		this.server.on( 'listening', this.onListening );
		this.server.listen( {
			host: '127.0.0.1',
			// port: 0,
			port: 3306,
		} );

		this.session.on( 'rawOutput', ( data ) => {
			/** @type Uint8Array */
			const x = data;
			this.log.debug( 'server:recv', data );
			this._writeData( data );
		} );
	}

	/** @param {Uint8Array} data */
	_writeData( data ) {
		const dataSize = data.length;

		// Resize buffer if data exceeds buffer length.
		if ( ( this.buffer.length - this.dataWaiting ) < dataSize ) {
			const factor = Math.ceil( ( dataSize - ( buffer.length - size ) ) / 8192 );

			const newBuffer = Buffer.alloc( this.buffer.length + ( 8192 * factor ) );
			this.buffer.copy( newBuffer, 0, 0, this.dataWaiting );
			this.buffer = newBuffer;
		}

		this.buffer.set( data, this.dataWaiting );
		this.dataWaiting += dataSize;

		this._maybeSend();
	}

	_maybeSend() {
		if ( this.pauseStream ) {
			return;
		}

		let sendMore = false;

		do {
			const amount = Math.min( 8192, this.dataWaiting );
			if ( amount <= 0 ) {
				// Don't pause the stream, just wrap up.
				return;
			}

			const chunk = Buffer.alloc( amount );
			this.buffer.copy( chunk, 0, 0, amount );
			this.log.debug( 'client:send', chunk );
			sendMore = this.pipeStream.push( chunk );
			this.buffer.copy( this.buffer, 0, amount, this.dataWaiting );
			this.dataWaiting -= amount;
		} while ( sendMore );

		this.pauseStream = true;
	}

	onListening = ( args ) => {
		const addr = this.server.address();
		this.log.debug( 'listen', addr );
		this.emit( 'listen', addr.port );
	}

	/**
	 * @param {net.Socket} socket
	 */
	onConnect = ( socket ) => {
		if ( ! this.session ) {
			const err = new Error( 'Socket not established' );
			socket.destroy( err );
			return;
		}

		/** @type Socket {socket} Socket */
		console.log( 'Client connected.' );
		this.log.debug( 'socket:connect' );
		socket.pipe( this.pipeStream );
		this.pipeStream.pipe( socket );

		socket.on( 'close', () => {
			// todo: close connection cleanly
			this.log.debug( 'socket:close' );
			process.exit();
		} );

		// Flush the buffered data.
		// this.pauseStream = false;
		// this._maybeSend();
	}

	onError = ( err ) => {
		this.log.debug( 'error', err );
	}

	onClose = () => {
		this.log.debug( 'close' );
	}

	onDrop = () => {
		this.log.debug( 'drop' );
	}
}

class PortForwardingConnection extends EventEmitter {
	idleTimer;
	/** @type Logger */
	log;
	session;

	constructor( log, data ) {
		super();

		this.log = log;
		this.session = new AWSSSMSession( data.stream_url, data.id, data.token, new WrappedLogger( this.log, 'ssm' ) );
		this.session.on( 'connect', this.onConnect );
		this.session.on( 'disconnect', this.onDisconnect );
		this.session.on( 'handshake', this.onHandshake );
		this.session.on( 'handshakeComplete', this.onHandshakeComplete );
		this.session.on( 'output', ( data ) => {
			// console.log( { data } );
			// process.stderr.write( data );
		} );
	}

	onConnect = () => {
		// Set up our listeners.
		process.on( 'beforeExit', () => {
			this.session.close();
		} );
		setTimeout( () => {
			// this.session.write( '\x01\x03' );
		}, 1000 );
		this.idleTimer = setInterval( () => {
			if ( ! this.session ) {
				return;
			}

			this.log.debug( 'ping' );
			this.session.ping();

			// this.session.write( '\x01\x03' );
		}, IDLE_INTERVAL );
	}

	onDisconnect = ( reason ) => {
		if ( this.idleTimer ) {
			clearInterval( this.idleTimer );
		}

		const message = reason ? `${ reason }. Disconnected.` : 'Disconnected.';
		process.stderr.write( message );
		this.session.close();
		process.exit();
	}

	onHandshake = data => {
		const resp = {
			// Must be <1.1.70 to avoid mux.
			ClientVersion: '1.1.69',
			ProcessedClientActions: [],
			Errors: null,
		};
		for ( const item of data.RequestedClientActions ) {
			const processed = {
				ActionType: item.ActionType,
				ActionResult: null,
				Error: '',
			};
			switch ( item.ActionType ) {
				case 'SessionType':
					// ...
					if ( item.ActionParameters.SessionType !== 'Port' ) {
						console.warn( `Unsupported session type ${ item.ActionParameters.SessionType }` );
						processed.ActionStatus = 2; // message.Failed
						processed.Error = "Failed to process actionn";
						break;
					}

					const sessionProps = item.ActionParameters.Properties;
					if ( sessionProps.type !== 'LocalPortForwarding' ) {
						console.warn( `Unsupported port session type ${ sessionProps.type }` );
						processed.ActionStatus = 2; // message.Failed
						processed.Error = "Failed to process actionn";
						break;
					}

					processed.ActionStatus = 1; // message.Success

					this.emit( 'startPortSession', sessionProps );
					break;

				default:
					processed.ActionResult = 3; // message.Unsupported
					console.warn( `Unsupported client action ${ item.ActionType }` );
					processed.Error = "Unsupported action";
					break;
			}

			resp.ProcessedClientActions.push( processed );
		}

		this.session.sendHandshakeResponse( resp );
	}

	onHandshakeComplete = data => {
		// {
		// 	"HandshakeTimeToComplete": 2006400425,
		// 	"CustomerMessage": ""
		// }
		this.emit( 'connected', {
			message: data.CustomerMessage,
		} );
	}
}

function connect( log, data ) {
	const conn = new PortForwardingConnection( log, data );
	const localServer = new PortServer( log, conn.session );

	conn.on( 'startPortSession', () => {
		localServer.start();
	} );
	conn.on( 'connected', data => {
		console.log( 'Now connected!' );
		if ( data.message.length ) {
			console.log( 'Server says: ' + data.message );
		}
	} )

	localServer.on( 'listen', port => {
		console.log( `MySQL server established on port ${ port }` );
	} );
}

const handler = function ( argv ) {
	const { config, debug } = argv;

	// const arr = new Uint8Array( [
	// 	0x00, 0x00, 0x00, 0x74, 0x69, 0x6e, 0x70, 0x75, 0x74, 0x5f, 0x73, 0x74, 0x72, 0x65, 0x61, 0x6d,
	// 	0x5f, 0x64, 0x61, 0x74, 0x61, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
	// 	0x20, 0x20, 0x20, 0x20, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x01, 0x84, 0x42, 0x61, 0x40, 0x25,
	// 	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
	// 	0xb8, 0x95, 0xa0, 0x35, 0x3a, 0xef, 0x10, 0xbc, 0x43, 0x80, 0x2c, 0x68, 0xe1, 0xa9, 0x41, 0xc8,
	// 	0x30, 0x65, 0x6b, 0xde, 0x98, 0x30, 0x20, 0xb4, 0xa0, 0x4d, 0x4f, 0xb8, 0x02, 0x74, 0x63, 0xad,
	// 	0x8c, 0xd1, 0x5d, 0x89, 0xd4, 0xb9, 0x53, 0xf9, 0x61, 0x65, 0x4b, 0x1d, 0x65, 0x79, 0xb9, 0xb9,
	// 	0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x08, 0x01, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00,
	// ] );
	// console.log( decode( arr ) );

	// const arr = new Uint8Array( [
	// 	0x00, 0x00, 0x00, 0x74, 0x69, 0x6e, 0x70, 0x75, 0x74, 0x5f, 0x73, 0x74, 0x72, 0x65, 0x61, 0x6d,
	// 	0x5f, 0x64, 0x61, 0x74, 0x61, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
	// 	0x20, 0x20, 0x20, 0x20, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x01, 0x84, 0x42, 0xbc, 0xd2, 0xdd,
	// 	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
	// 	0xa1, 0x52, 0x49, 0x93, 0x85, 0x57, 0xa1, 0xbe, 0x9b, 0x42, 0xf1, 0xa2, 0xff, 0x77, 0x4f, 0xa2,
	// 	0x19, 0x72, 0x3f, 0xc4, 0xe6, 0x96, 0x80, 0x7b, 0x01, 0xbf, 0xa3, 0x6c, 0x5c, 0xca, 0x5f, 0xb7,
	// 	0xb0, 0x28, 0x0d, 0x4c, 0x9e, 0xca, 0x81, 0x44, 0x27, 0xf5, 0x55, 0xa7, 0xd0, 0xe7, 0xa3, 0xa7,
	// 	0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x08, 0x01, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
	// ] );
	const log = debug ? new Logger() : new NullLogger();

	// console.log( decode( arr ) );
	// return;

	const rawData = fs.readFileSync( 0, 'utf-8' );
	const data = JSON.parse( rawData );


	// getStack( argv ).then( stack => {
	// 	const v = new Vantage( config );

	// 	const status = new ora( `Starting session on ${stack}` );
	// 	status.start();

	// 	const url = `stack/applications/${stack}/cli/sessions`;
	// 	v.fetch( url, { method: 'POST' } ).then( resp => {
	// 		// hm-stack currently returns a 500 for invalid stacks, so we have to
	// 		// assume any failure is a 404: https://github.com/humanmade/hm-stack/issues/367
	// 		if ( ! resp.ok ) {
	// 			status.fail( `Invalid stack ${stack}` );
	// 			return;
	// 		}

	// 		return resp.json().then( data => {
	// 			status.stop();
				connect( log, data );
	// 		});
	// 	}).catch( e => {
	// 		status.fail( `Could not fetch details for ${stack}` );
	// 		throw e;
	// 	});
	// } );
};

module.exports = {
	command: 'db-conn [stack]',
	description: 'DB? into a stack.',
	builder: subcommand => {
		subcommand.option( 'app-server', {
			description: 'Use an app server instead of the sandbox.',
			default: false,
			type: 'boolean',
		} );
		subcommand.option( 'debug', {
			description: 'Output debug logs to the terminal',
			default: false,
			type: 'boolean',
		} );
	},
	handler,
};
