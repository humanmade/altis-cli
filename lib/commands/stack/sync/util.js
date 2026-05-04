import bytes from 'bytes';
import chalk from 'chalk';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import inquirer from 'inquirer';
import fetch from 'node-fetch';
import ora from 'ora';
import path from 'path';
import progressStream from 'progress-stream';
import { pipeline } from 'stream/promises';
import { format, parse } from 'url';
import { createGunzip } from 'zlib';
import { createRequire } from 'module';
import { streamLog } from '../util.js';

const require = createRequire( import.meta.url );

export const CONTAINER_ROOT = '/usr/src/app';
export const SYNC_DIR = '.altis-sync';

// --- Local project validation ---

export function validateLocalProject( localPath ) {
	const composerJsonPath = path.join( localPath, 'composer.json' );
	if ( ! fs.existsSync( composerJsonPath ) ) {
		throw new Error( `No composer.json found at ${ localPath }` );
	}

	const composer = JSON.parse( fs.readFileSync( composerJsonPath, 'utf8' ) );
	const deps = { ...( composer.require || {} ), ...( composer[ 'require-dev' ] || {} ) };
	if ( ! deps[ 'altis/local-server' ] ) {
		throw new Error( 'altis/local-server is not a dependency in composer.json' );
	}

	if ( ! fs.existsSync( path.join( localPath, 'content' ) ) ) {
		throw new Error( `content/ directory not found at ${ localPath }` );
	}

	try {
		execSync( 'composer --version', { stdio: 'pipe' } );
	} catch {
		throw new Error( 'composer not found on PATH. Install it from https://getcomposer.org' );
	}

	try {
		execSync( 'composer server status', { cwd: localPath, stdio: 'pipe' } );
	} catch {
		throw new Error( 'local-server is not running. Start it with: composer server start' );
	}
}

// --- Destructive action confirmation ---

export async function confirm( message ) {
	const { ok } = await inquirer.prompt( {
		type: 'confirm',
		name: 'ok',
		message,
		default: false,
	} );
	if ( ! ok ) {
		console.log( chalk.yellow( 'Cancelled.' ) );
		process.exit( 0 );
	}
}

// --- Remote backup creation ---

export async function startBackup( v, stack, opts ) {
	const urlBits = parse( `stack/applications/${ stack }/backups`, true );
	urlBits.query = { ...opts, stream: 'true' };
	const url = format( urlBits );

	const resp = await v.fetch( url, { method: 'POST' } );
	const text = await resp.text();
	if ( ! resp.ok ) {
		throw new Error( `Backup request failed: ${ text }` );
	}
	return text.trim();
}

// --- Find completed backup ---

export async function findCompletedBackup( v, stack, startTime ) {
	const resp = await v.fetch( `stack/applications/${ stack }/backups` );
	if ( ! resp.ok ) {
		throw new Error( `Failed to list backups: ${ resp.status }` );
	}
	const backups = await resp.json();
	const candidates = backups
		.filter( b => new Date( b.date ) >= startTime )
		.sort( ( a, b ) => new Date( b.date ) - new Date( a.date ) );

	return candidates[ 0 ] || null;
}

// --- Get latest existing backup ---

export async function getLatestBackup( v, stack ) {
	const resp = await v.fetch( `stack/applications/${ stack }/backups` );
	if ( ! resp.ok ) return null;
	const backups = await resp.json();
	if ( ! backups.length ) return null;
	return backups.sort( ( a, b ) => new Date( b.date ) - new Date( a.date ) )[ 0 ];
}

// --- Prompt: use latest backup or create new ---

export async function promptBackupChoice( v, stack ) {
	const latest = await getLatestBackup( v, stack );
	if ( ! latest ) return null;

	const age = formatAge( new Date( latest.date ) );
	const { choice } = await inquirer.prompt( {
		type: 'list',
		name: 'choice',
		message: `Use an existing backup or create a new one for ${ chalk.bold( stack ) }?`,
		choices: [
			{ name: `Use latest backup  ${ chalk.dim( `${ latest.id } · ${ age } old` ) }`, value: 'latest' },
			{ name: 'Create a new backup', value: 'new' },
		],
	} );

	return choice === 'latest' ? latest : null;
}

export function formatAge( date ) {
	const diffMs = Date.now() - date.getTime();
	const diffMins = Math.floor( diffMs / 60000 );
	if ( diffMins < 60 ) return `${ diffMins }m`;
	const diffHours = Math.floor( diffMins / 60 );
	if ( diffHours < 24 ) return `${ diffHours }h`;
	return `${ Math.floor( diffHours / 24 ) }d`;
}

// --- Stream backup progress with poll fallback ---
// The SSE stream can hang if the backup completes before we connect.
// Poll every 10s as a fallback so we don't block forever.

export function waitForBackup( v, stack, logId, startTime, debug ) {
	return new Promise( ( resolve, reject ) => {
		let done = false;

		const finish = ( err ) => {
			if ( done ) return;
			done = true;
			clearInterval( pollTimer );
			err ? reject( err ) : resolve();
		};

		// Stream for live progress
		streamLog( v, stack, logId, debug ).then( () => finish() ).catch( finish );

		// Poll every 10s in case stream misses the complete event
		const pollTimer = setInterval( async () => {
			if ( done ) return;
			try {
				const backup = await findCompletedBackup( v, stack, startTime );
				if ( backup ) finish();
			} catch {
				// Ignore poll errors — stream is still the primary signal
			}
		}, 10000 );
	} );
}

// --- Download archive ---

export async function downloadArchive( url, dest ) {
	const spinner = ora( 'Downloading backup…' ).start();
	const resp = await fetch( url );
	if ( ! resp.ok ) {
		spinner.fail( 'Download failed.' );
		throw new Error( `Download failed: ${ resp.status } ${ resp.statusText }` );
	}

	const size = parseInt( resp.headers.get( 'content-length' ) || '0', 10 );
	const progress = new progressStream( { length: size, time: 200 } );
	progress.on( 'progress', p => {
		spinner.text = `Downloading… ${ p.percentage.toFixed( 1 ) }% (${ bytes( p.speed ) }/s)`;
	} );

	await pipeline( resp.body, progress, fs.createWriteStream( dest ) );
	spinner.succeed( `Downloaded to ${ chalk.underline( dest ) }` );
}

// --- Extract archive ---

export async function extractArchive( archivePath, extractDir ) {
	fs.mkdirSync( extractDir, { recursive: true } );
	await runProcess( 'tar', [ '-xf', archivePath, '-C', extractDir ] );
}

// --- Search-replace mappings ---

export function resolveMappings( localPath, key, explicitPairs, skip ) {
	if ( skip ) {
		return {};
	}

	const composer = JSON.parse( fs.readFileSync( path.join( localPath, 'composer.json' ), 'utf8' ) );
	const configMappings = composer?.extra?.altis?.cloud?.[ 'search-replace' ]?.[ key ] || {};
	const mappings = { ...configMappings };

	for ( const pair of ( explicitPairs || [] ) ) {
		const eqIdx = pair.indexOf( '=' );
		if ( eqIdx < 1 ) {
			throw new Error( `Invalid --replace value "${ pair }". Expected format: from=to` );
		}
		mappings[ pair.slice( 0, eqIdx ) ] = pair.slice( eqIdx + 1 );
	}

	for ( const [ from, to ] of Object.entries( mappings ) ) {
		if ( ! from || ! to ) {
			throw new Error( `Invalid search-replace mapping: "${ from }" => "${ to }"` );
		}
	}

	return mappings;
}

// --- Search-replace SQL and import into local-server ---

export async function searchReplaceAndImport( sqlGzPath, mappings, localPath ) {
	const { replace } = require( '@automattic/vip-search-replace' );

	const syncDir = path.join( localPath, SYNC_DIR );
	const sqlDest = path.join( syncDir, 'database.sql' );
	fs.mkdirSync( syncDir, { recursive: true } );

	const spinner = ora( 'Running search-replace on SQL…' ).start();
	const readStream = fs.createReadStream( sqlGzPath ).pipe( createGunzip() );
	const replacements = Object.entries( mappings ).flat();

	const sqlStream = replacements.length > 0
		? await replace( readStream, replacements )
		: readStream;

	await pipeline( sqlStream, fs.createWriteStream( sqlDest ) );
	spinner.succeed( `Search-replace complete (${ Object.keys( mappings ).length } mapping(s))` );

	const containerPath = `${ CONTAINER_ROOT }/${ SYNC_DIR }/database.sql`;
	console.log( chalk.dim( 'Importing database into local-server (this may take a while)…' ) );
	await runComposerServer( localPath, [ 'cli', '--', 'db', 'import', containerPath ] );
	console.log( chalk.dim( 'Database import complete.' ) );

	fs.unlinkSync( sqlDest );
	try {
		fs.rmdirSync( syncDir );
	} catch {
		// Not empty (e.g. other files) — that's fine
	}
}

// --- Copy uploads into content/uploads ---

export function copyUploads( extractDir, localPath ) {
	const src = path.join( extractDir, 'uploads' );
	const dest = path.join( localPath, 'content', 'uploads' );
	fs.mkdirSync( dest, { recursive: true } );
	fs.cpSync( src, dest, { recursive: true } );
}

// --- composer server helpers ---

export function runComposerServer( localPath, args ) {
	return runProcess( 'composer', [ 'server', ...args ], { cwd: localPath } );
}

export async function runPostSync( localPath ) {
	const registered = await new Promise( resolve => {
		const proc = spawn( 'composer', [ 'server', 'cli', '--', 'altis', 'post-sync', '--help' ], {
			cwd: localPath,
			stdio: 'pipe',
		} );
		proc.on( 'close', code => resolve( code === 0 ) );
		proc.on( 'error', () => resolve( false ) );
	} );

	if ( ! registered ) return;

	try {
		await runComposerServer( localPath, [ 'cli', '--', 'altis', 'post-sync' ] );
	} catch ( err ) {
		console.warn( chalk.yellow( `Warning: wp altis post-sync failed: ${ err.message }` ) );
	}
}

// --- Common yargs option builders ---

export function addCommonOptions( cmd ) {
	cmd.option( 'path', {
		description: 'Local Altis project path. Defaults to current working directory.',
		type: 'string',
	} );
	cmd.option( 'output-dir', {
		description: 'Working directory for downloaded archives. Defaults to a temp directory.',
		type: 'string',
	} );
	cmd.option( 'keep-archive', {
		description: 'Keep downloaded archive and extracted files after restore.',
		type: 'boolean',
		default: false,
	} );
	cmd.option( 'yes', {
		description: 'Skip destructive action confirmations.',
		type: 'boolean',
		default: false,
	} );
	cmd.option( 'resume', {
		description: 'Resume watching an already-started remote backup task.',
		type: 'string',
	} );
	cmd.option( 'debug', {
		description: 'Enable debug output for stream logging.',
		type: 'boolean',
		default: false,
	} );
	cmd.option( 'json', {
		description: 'Print machine-readable JSON summary.',
		type: 'boolean',
		default: false,
	} );
}

export function addDatabaseOptions( cmd ) {
	cmd.option( 'tables', {
		description: 'Comma-separated list of tables to include in the backup.',
		type: 'string',
	} );
	cmd.option( 'search-replace-key', {
		description: 'composer.json key under extra.altis.cloud.search-replace. Defaults to local-server.',
		type: 'string',
		default: 'local-server',
	} );
	cmd.option( 'replace', {
		description: 'Explicit search-replace mapping (from=to). Repeatable.',
		type: 'array',
	} );
	cmd.option( 'skip-search-replace', {
		description: 'Skip the search-replace step.',
		type: 'boolean',
		default: false,
	} );
	cmd.option( 'dry-run-search-replace', {
		description: 'Print resolved mappings without triggering a backup or import.',
		type: 'boolean',
		default: false,
	} );
	cmd.option( 'skip-post-sync', {
		description: 'Skip the wp altis post-sync hook.',
		type: 'boolean',
		default: false,
	} );
}

export function addUploadsOptions( cmd ) {
	cmd.option( 'uploads-path', {
		description: 'Uploads prefix to export from the remote app.',
		type: 'string',
	} );
}

// --- Internal helpers ---

function runProcess( cmd, args, opts = {} ) {
	return new Promise( ( resolve, reject ) => {
		const proc = spawn( cmd, args, { stdio: 'inherit', ...opts } );
		proc.on( 'close', code => {
			if ( code === 0 ) {
				resolve();
			} else {
				reject( new Error( `${ cmd } ${ args.join( ' ' ) } exited with code ${ code }` ) );
			}
		} );
		proc.on( 'error', reject );
	} );
}
