import chalk from 'chalk';
import columnify from 'columnify';
import inquirer from 'inquirer';
import ora from 'ora';
import Vantage from '../../vantage.js';

const INDENT = chalk.dim( '→ ' );
const PROGRESS_WIDTH = 5;

export function getStack(argv) {
	const { config, stack } = argv;

	if ( stack ) {
		return Promise.resolve( stack );
	}

	const regionStatus = new ora( `Finding available stacks` );
	regionStatus.start();
	return Vantage.getStacks( config )
		.then( stacks => {
			regionStatus.stop();
			return inquirer.prompt( {
				type: 'list',
				name: 'stack',
				message: 'Select stack:',
				choices: stacks,
			} );
		} )
		.then( answers => answers.stack );
}

export function getApp(argv) {
	return getStack(argv);
}

export async function fetchJSON(vantage, url, opts = {}) {
	const resp = await vantage.fetch(url, opts);
	let data = null;
	const text = await resp.text();
	if (text) {
		try {
			data = JSON.parse(text);
		} catch (e) {
			data = text;
		}
	}

	if (!resp.ok) {
		const message = data && typeof data === 'object' && data.message ? data.message : text || resp.statusText;
		const err = new Error(message);
		if (data && typeof data === 'object' && data.code) {
			err.code = data.code;
		}
		err.status = resp.status;
		throw err;
	}

	return data;
}

export function buildQuery(params = {}) {
	const query = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value === undefined || value === null || value === false || value === '') {
			return;
		}
		if (Array.isArray(value)) {
			value.forEach(item => query.append(key, item));
			return;
		}
		if (typeof value === 'object') {
			Object.entries(value).forEach(([childKey, childValue]) => {
				if (childValue !== undefined && childValue !== null && childValue !== '') {
					query.append(`${key}[${childKey}]`, childValue);
				}
			});
			return;
		}
		query.append(key, value);
	});
	const string = query.toString();
	return string ? `?${string}` : '';
}

export function parseList(value) {
	if (!value) {
		return [];
	}
	if (Array.isArray(value)) {
		return value.flatMap(parseList);
	}
	return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

export function parseKeyValueArgs(arr = []) {
	const values = Array.isArray(arr) ? arr : [arr];
	return values.reduce((acc, item) => {
		const eq = String(item).indexOf('=');
		if (eq < 1) {
			throw new Error(`Expected key=value, got "${item}".`);
		}
		acc[String(item).slice(0, eq)] = String(item).slice(eq + 1);
		return acc;
	}, {});
}

export function parseReplacements(arr = []) {
	return parseKeyValueArgs(arr);
}

export async function confirm(message) {
	const answers = await inquirer.prompt({
		type: 'confirm',
		name: 'confirmed',
		message,
		default: false,
	});
	return answers.confirmed;
}

export function printJSON(data) {
	console.log(JSON.stringify(data, null, 2));
}

export function printTable(rows, options = {}) {
	if (!rows || rows.length === 0) {
		console.log(chalk.grey('No results.'));
		return;
	}
	console.log(columnify(rows, {
		columnSplitter: chalk.grey(' | '),
		headingTransform: name => chalk.blue(name.toUpperCase()),
		...options,
	}));
}

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
	const progress = '░'.repeat( progressChars ) + '⠂'.repeat( Math.max( 0, PROGRESS_WIDTH - progressChars ) );
	lastStatusLine = `${ status.spinner.frame() } [${ progress }] ${ chalk.yellow( status.step ) }`;
	process.stderr.write( lastStatusLine );
}

export function streamLog(vantage, stack, log, debug) {
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

export function renderRepo(repo) {
	const matches = repo.match( /git@github.com:([\w\-\.]+)\/([\w\-\.]+).git/i );
	if ( ! matches ) {
		return repo;
	}

	const user = matches[1] === 'humanmade' ? chalk.dim( matches[1] ) : matches[1];
	return `${user}/${matches[2]}`;
}

export function renderCommit(commit) {
	return `${commit.rev.substring(0, 5)} (${commit.description})`;
}
