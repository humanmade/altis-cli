import ora from 'ora';
import pkg from '@humanmade/ssm';
const AWSSSMSession = pkg.default;
import { getStack } from './util.js';
import Vantage from '../../vantage.js';

// Keep the socket alive by pinging every 30s.
const IDLE_INTERVAL = 30_000;

const INITIAL_SIZE_WAIT = 700;

export function attachSessionInput( session, input = process.stdin, errorOutput = process.stderr ) {
	let lastWasNewline = true;
	let startedSshControl = false;
	const wasRaw = Boolean( input.isRaw );

	const listener = data => {
		let msg = '';
		for ( const byte of data.values() ) {
			// ~ byte, indicates start of control code.
			if ( lastWasNewline && byte === 0x7E && !startedSshControl ) {
				startedSshControl = true;
				continue;
			}

			// Check for newlines (LF or CR).
			lastWasNewline = byte === 0x0A || byte === 0x0D;

			const char = String.fromCharCode( byte );
			if ( startedSshControl ) {
				startedSshControl = false;
				// ~.  - terminate connection (and any multiplexed sessions)
				if ( byte === 0x2E ) {
					session.close();
					return;
				}

				// ~^Z - suspend ssh
				if ( byte === 0x1A ) {
					errorOutput.write( '~^Z [suspend ssh]' );
					process.kill( process.pid, 'SIGTSTP' );
					return;
				}

				// ~?  - show supported escape sequences
				if ( byte === 0x3F ) {
					let message = '~?\nSupported escape sequences:\n';
					message += '~.  - terminate connection (and any multiplexed sessions)\n';
					message += '~^Z - suspend ssh\n';
					message += '~?  - this message\n';
					message += '(Note that escapes are only recognized immediately after newline.)\n';
					errorOutput.write( message );

					// Allow immediate input of another control command.
					lastWasNewline = true;
					break;
				}

				// ~~ sends the escape character. Any other sequence sends both
				// the leading ~ and the typed character to the remote session.
				msg += '~';
			}

			msg += char;
		}

		if ( msg ) {
			session.write( msg );
		}
	};

	if ( input.isTTY && typeof input.setRawMode === 'function' ) {
		input.setRawMode( true );
	}
	input.on( 'data', listener );
	input.resume();

	return () => {
		input.removeListener( 'data', listener );
		if ( input.isTTY && typeof input.setRawMode === 'function' ) {
			input.setRawMode( wasRaw );
		}
	};
}

export function startKeepalive( session, schedule = setInterval ) {
	return schedule( () => session.ping(), IDLE_INTERVAL );
}

function connect( data ) {
	let idleTimer;
	let initializationTimer;
	let terminalResizeListener;
	let terminalResizeDebounce;
	let detachInput;
	let beforeExitListener;
	const session = new AWSSSMSession( data.stream_url, data.aws_ssm_session_id, data.token );
	const cleanup = () => {
		if ( initializationTimer ) {
			clearTimeout( initializationTimer );
			initializationTimer = null;
		}
		if ( terminalResizeDebounce ) {
			clearTimeout( terminalResizeDebounce );
			terminalResizeDebounce = null;
		}
		if ( terminalResizeListener ) {
			process.stdout.removeListener( 'resize', terminalResizeListener );
			terminalResizeListener = null;
		}
		if ( idleTimer ) {
			clearInterval( idleTimer );
			idleTimer = null;
		}
		if ( detachInput ) {
			detachInput();
			detachInput = null;
		}
		if ( beforeExitListener ) {
			process.removeListener( 'beforeExit', beforeExitListener );
			beforeExitListener = null;
		}
	};

	session.on( 'connect', () => {
		initializationTimer = setTimeout( () => {
			initializationTimer = null;
			session.setSize( process.stdout.columns, process.stdout.rows );
			detachInput = attachSessionInput( session );

			terminalResizeListener = () => {
				if ( terminalResizeDebounce ) {
					clearTimeout( terminalResizeDebounce );
				}

				terminalResizeDebounce = setTimeout( () => {
					session.setSize( process.stdout.columns, process.stdout.rows );
				}, 500 );
			};

			process.stdout.on( 'resize', terminalResizeListener );
		}, INITIAL_SIZE_WAIT );

		// Set up our listeners.
		beforeExitListener = () => session.close();
		process.on( 'beforeExit', beforeExitListener );
		idleTimer = startKeepalive( session );
	} );
	session.on( 'disconnect', ( reason ) => {
		cleanup();
		const message = reason ? `${ reason }. Disconnected.` : 'Disconnected.';
		process.stderr.write( `${ message }\n` );
		process.exit();
	} );
	session.on( 'output', ( data ) => {
		process.stdout.write( data );
	} );
}

const handler = function ( argv ) {
	const { config } = argv;

	getStack( argv ).then( stack => {
		const v = new Vantage( config );

		const status = new ora( `Starting session on ${stack}` );
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
				connect( data );
			});
		}).catch( e => {
			status.fail( `Could not fetch details for ${stack}` );
			throw e;
		});
	} );
};

export default {
	command: 'ssh [stack]',
	description: 'SSH into a stack.',
	builder: subcommand => {
		subcommand.option('app-server', {
			description: 'Use an app server instead of the sandbox.',
			default: false,
			type: 'boolean',
		});
	},
	handler,
};
