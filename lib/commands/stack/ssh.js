const ora = require( 'ora' );

const AWSSSMSession = require( '@humanmade/ssm' ).default;

const { getStack } = require( './util' );
const Vantage = require( '../../vantage' );

// Keep the socket alive by pinging every 10s.
const IDLE_INTERVAL = 30_000;

const INITIAL_SIZE_WAIT = 700;

function connect( data, porcelain = false ) {
	let idleTimer;
	let lastWasNewline = true;
	let startedSshControl = false;
	const session = new AWSSSMSession( data.stream_url, data.aws_ssm_session_id, data.token );
	session.on( 'connect', () => {
		setTimeout( () => {
			if ( ! session ) {
				return;
			}
			session.setSize( process.stdout.columns, process.stdout.rows );

			if ( process.stdin.isTTY ) {
				process.stdin.setRawMode( true );
			}
			setTimeout( () => {
				process.stdin.on( 'data', data => {
					let msg = '';
					for ( const byte of data.values() ) {
						// ~ byte, indicates start of control code.
						if ( lastWasNewline && byte === 0x7E && !startedSshControl ) {
							startedSshControl = true;
							continue;
						}

						// Check for newlines (LF or CR).
						if ( byte === 0x0A || byte === 0x0D ) {
							lastWasNewline = true;
						} else {
							lastWasNewline = false;
						}

						const char = String.fromCharCode( byte );
						if ( startedSshControl ) {
							startedSshControl = false;
							// ~.  - terminate connection (and any multiplexed sessions)
							if ( byte === 0x2E ) {
								session.close();
								return;
							}

							// ~B  - send a BREAK to the remote system
							// ~C  - open a command line
							// ~R  - Request rekey (SSH protocol 2 only)
							// ~^Z - suspend ssh
							if ( byte === 0x1A ) {
								process.stderr.write( '~^Z [suspend ssh]' );
								process.kill( process.pid, 'SIGTSTP' );
								return;
							}

							// ~#  - list forwarded connections
							// ~&  - background ssh (when waiting for connections to terminate)
							// ~?  - this message
							if ( byte === 0x3F ) {
								let message = '~?\nSupported escape sequences:\n';
								message += '~.  - terminate connection (and any multiplexed sessions)\n';
								message += '~^Z - suspend ssh\n';
								message += '~?  - this message\n';
								message += '(Note that escapes are only recognized immediately after newline.)\n';
								process.stderr.write( message );

								// Allow immediate input of another control command.
								lastWasNewline = true;
								break;
							}

							// ~~  - send the escape character by typing it twice
							// Everything else: invalid escape, send ~ and actual char.
							process.stderr.write( byte.toString( 16 ) );
							msg += '~';
						}

						msg += char;
					}
					console.log('write: ' + message );
					session.write( msg );
				} );
			}, 1000 );
		}, INITIAL_SIZE_WAIT );

		// Set up our listeners.
		process.on( 'beforeExit', () => {
			session.close();
		} );
		idleTimer = setInterval( () => {
			if ( ! this.awsSSMSession ) {
				return;
			}

			this.awsSSMSession.ping();
		}, IDLE_INTERVAL );
	} );
	session.on( 'disconnect', ( reason ) => {
		if ( idleTimer ) {
			clearInterval( idleTimer );
		}

		const message = reason ? `${ reason }. Disconnected.` : 'Disconnected.';
		if ( ! porcelain ) {
			process.stdout.write( message );
		}
		session.close();
		process.exit();
	} );

	let firstOutput = true;
	session.on( 'output', ( data ) => {

		// If this is the first output chunk and we're in porcelain mode, strip the initial 2 lines
		// this contain somethign like:
		//     exec sudo sandbox-exec 'clear; $command'
		//     sh-4.2$ exec sudo sandbox-exec 'clear; $command'
		if ( porcelain && firstOutput ) {
			data = data.split( '\n' ).slice(2).join('\n').trim();
		}
		firstOutput = false;
		// Strip the ANSI escape codes if we're in porcelain mode.
		if ( porcelain ) {
			data = data.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
		}
		process.stdout.write( data );
	} );
}

const handler = function ( argv ) {
	const { config } = argv;

	getStack( argv ).then( stack => {
		const v = new Vantage( config );
		const status = new ora( `Starting session on ${stack}` );

		if ( ! argv.command ) {
			status.start();
		}

		const url = `stack/applications/${stack}/cli/sessions`;
		const args = {
			motd: ! argv.command,
		};

		if ( argv.command ) {
			// Set the SHELL_PIPE=1 env var when running the command if the current process is piped.
			args.command = `${ process.stdout.isTTY ? '' : 'SHELL_PIPE=1 ' }${ argv.command }`;
		}

		const options = {
			method: 'POST',
			body: JSON.stringify( args ),
			headers: {
				'Content-Type': 'application/json',
			},
		};

		v.fetch( url, options ).then( resp => {
			// hm-stack currently returns a 500 for invalid stacks, so we have to
			// assume any failure is a 404: https://github.com/humanmade/hm-stack/issues/367
			if ( ! resp.ok ) {
				status.fail( `Invalid stack ${stack}` );
				return;
			}
			return resp.text().then( text => {
				const data = JSON.parse( text );
				status.stop();
				connect( data, !! argv.command );
			} );
		}).catch( e => {
			status.fail( `Could create session ${stack} (${e.message})` );
			throw e;
		});
	} );
};

module.exports = {
	command: 'ssh [stack]',
	description: 'SSH into a stack.',
	builder: subcommand => {
		subcommand.option( 'app-server', {
			description: 'Use an app server instead of the sandbox.',
			default: false,
			type: 'boolean',
		} );
		subcommand.option( 'command', {
			description: 'Run a given command and exit.',
			type: 'string',
		} );
	},
	handler,
};
