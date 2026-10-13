import type { Options as TableOptions } from 'columnify';
import type { RequestInit } from 'node-fetch';
import type { CliArguments, CommandBuilder } from '../../types/cli.ts';
import chalk from 'chalk';
import columnify from 'columnify';
import inquirer from 'inquirer';
import ora from 'ora';
import Vantage, { getStacks } from '../../vantage.ts';

export class ApiError extends Error {
	status: number;
	code?: string;
	constructor(message: string, status: number, code?: string) {
		super(message);
		this.status = status;
		this.code = code;
	}
}
interface LogStatus {
	spinner: ReturnType<typeof ora>;
	step: string;
	progress: number;
	log: string[];
}
const INDENT = chalk.dim( '→ ' );
const PROGRESS_WIDTH = 5;

export function getStack(argv: Pick<CliArguments, 'app' | 'stack'> & Partial<Pick<CliArguments, 'config'>>): Promise<string> {
	const { config } = argv;
	const stack = argv.stack;

	if ( stack ) {
		return Promise.resolve( stack );
	}

	const regionStatus = ora( `Finding available stacks` );
	regionStatus.start();
	return getStacks( config! )
		.then( stacks => {
			regionStatus.stop();
			return inquirer.prompt<{ stack: string }>( {
				type: 'list',
				name: 'stack',
				message: 'Select stack:',
				choices: stacks,
			} );
		} )
		.then( answers => answers.stack );
}

export function getApp(argv: CliArguments) {
	return getStack(argv);
}

export async function fetchJSON<T = unknown>(vantage: Vantage, url: string, opts: RequestInit = {}): Promise<T> {
	const resp = await vantage.fetch(url, opts);
	let data: unknown = null;
	const text = await resp.text();
	if (text) {
		try {
			data = JSON.parse(text);
		} catch (e) {
			data = text;
		}
	}

	if (!resp.ok) {
		const errorData = data && typeof data === 'object' ? data as { message?: unknown; code?: unknown } : {};
		const message = typeof errorData.message === 'string' ? errorData.message : text || resp.statusText;
		const err = new ApiError(message, resp.status, typeof errorData.code === 'string' ? errorData.code : undefined);
		throw err;
	}

	return data as T;
}

export function buildQuery(params: Record<string, unknown> = {}) {
	const query = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value === undefined || value === null || value === false || value === '') {
			return;
		}
		if (Array.isArray(value)) {
			value.forEach(item => query.append(key, String(item)));
			return;
		}
		if (typeof value === 'object') {
			Object.entries(value).forEach(([childKey, childValue]) => {
				if (childValue !== undefined && childValue !== null && childValue !== '') {
					query.append(`${key}[${childKey}]`, String(childValue));
				}
			});
			return;
		}
		query.append(key, String(value));
	});
	const string = query.toString();
	return string ? `?${string}` : '';
}

export function parseList(value: unknown): string[] {
	if (!value) {
		return [];
	}
	if (Array.isArray(value)) {
		return value.flatMap(parseList);
	}
	return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

export function parseKeyValueArgs(arr: string | (string | number)[] = []): Record<string, string> {
	const values = Array.isArray(arr) ? arr : [arr];
	return values.reduce((acc, item) => {
		const eq = String(item).indexOf('=');
		if (eq < 1) {
			throw new Error(`Expected key=value, got "${item}".`);
		}
		acc[String(item).slice(0, eq)] = String(item).slice(eq + 1);
		return acc;
	}, {} as Record<string, string>);
}

export function parseReplacements(arr: string | (string | number)[] = []) {
	return parseKeyValueArgs(arr);
}

export async function confirm(message: string) {
	const answers = await inquirer.prompt({
		type: 'confirm',
		name: 'confirmed',
		message,
		default: false,
	});
	return answers.confirmed;
}

export function printJSON(data: unknown) {
	console.log(JSON.stringify(data, null, 2));
}

export function printTable(rows: Record<string, unknown>[], options: TableOptions = {}) {
	if (!rows || rows.length === 0) {
		console.log(chalk.grey('No results.'));
		return;
	}
	console.log(columnify(rows, {
		columnSplitter: chalk.grey(' | '),
		headingTransform: (name: string) => chalk.blue(name.toUpperCase()),
		...options,
	}));
}

/**
 * Notify users that a legacy command path has a canonical replacement.
 *
 * Keep this in the shared command utility so compatibility shims use a
 * consistent stderr format and can be removed together in the next major
 * release.
 */

let lastStatusLine: string | null = null;

function renderStatus( status: LogStatus ) {
	// Erase previous status bar.
	if ( lastStatusLine ) {
		process.stderr.clearLine(0);
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

export function streamLog(vantage: Vantage, stack: string, log: string, debug: boolean = false): Promise<void> {
	const status: LogStatus = {
		spinner: ora(),
		step: 'Connecting…',
		progress: 0,
		log: [],
	};

	return new Promise<void>( ( resolve, reject ) => {
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
						const parsed = JSON.parse( data ) as { message: string; level: string };
						const messageLines = parsed.message.split( '\n' );
						Array.prototype.push.apply( status.log, messageLines.map( (line: string) => chalk.red( line ) ) );

						stream.destroy();
						status.spinner.fail( chalk.bold.red( 'Failed.' ) );
						reject( new Error( parsed.message ) );
						break;
					}

					case 'percentComplete':
						status.progress = parseInt( data, 10 );
						break;

					case 'log':
						const parsed = JSON.parse( data ) as { message: string; level: string };
						const delimPos = parsed.message.indexOf( '::' );
						const isErrorOutput = delimPos > 0 && parsed.message.substring( 0, delimPos ) === 'err';

						// Strip prefixes:
						const output = delimPos > 0 ? parsed.message.substring( delimPos + 2 ) : parsed.message;
						const messageLines = output.trim().split( '\n' );
						switch ( parsed.level ) {
							case 'info':
								status.step = messageLines.slice( -1 ).join('');
								Array.prototype.push.apply( status.log, messageLines.map( (t: string) => chalk.yellow( t ) ) );
								break;

							case 'debug':
								let lines = messageLines.map( (line: string) => INDENT + line );
								if ( isErrorOutput ) {
									lines = lines.map( (line: string) => chalk.red( line ) );
								}
								Array.prototype.push.apply( status.log, lines );
								break;
						}
						break;

					case 'complete':
						status.progress = 100;
						stream.destroy();
						status.spinner.succeed( chalk.bold.green( 'Complete!' ) );
						resolve();
						break;
				}
			});
		}).catch( reject );
	} );
}

export function renderRepo(repo: string) {
	const matches = repo.match( /git@github.com:([\w\-\.]+)\/([\w\-\.]+).git/i );
	if ( ! matches ) {
		return repo;
	}

	const user = matches[1] === 'humanmade' ? chalk.dim( matches[1] ) : matches[1];
	return `${user}/${matches[2]}`;
}

export function renderCommit(commit: { rev: string; description: string }) {
	return `${commit.rev.substring(0, 5)} (${commit.description})`;
}
