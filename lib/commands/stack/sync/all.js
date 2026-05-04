import chalk from 'chalk';
import fs from 'fs';
import ora from 'ora';
import path from 'path';
import { tmpdir } from 'os';

import Vantage from '../../../vantage.js';
import {
	addCommonOptions,
	addDatabaseOptions,
	addUploadsOptions,
	confirm,
	copyUploads,
	downloadArchive,
	extractArchive,
	findCompletedBackup,
	formatAge,
	promptBackupChoice,
	resolveMappings,
	runComposerServer,
	runPostSync,
	searchReplaceAndImport,
	startBackup,
	validateLocalProject,
	waitForBackup,
} from './util.js';

const handler = async function ( argv ) {
	const {
		app,
		config,
		path: pathOpt,
		uploadsPath,
		outputDir,
		keepArchive,
		yes,
		resume,
		debug,
		tables,
		searchReplaceKey,
		replace: replacePairs,
		skipSearchReplace,
		dryRunSearchReplace,
		skipPostSync,
	} = argv;

	const localPath = pathOpt || process.cwd();
	const v = new Vantage( config );

	// --dry-run-search-replace: just print mappings, no validation or network needed
	if ( dryRunSearchReplace ) {
		try {
			const mappings = resolveMappings( localPath, searchReplaceKey, replacePairs, skipSearchReplace );
			if ( Object.keys( mappings ).length === 0 ) {
				console.log( chalk.yellow( 'No search-replace mappings found.' ) );
				console.log( `Configure them under extra.altis.cloud.search-replace.${ searchReplaceKey } in composer.json, or use --replace.` );
			} else {
				console.log( chalk.bold( 'Search-replace mappings that would be applied:' ) );
				for ( const [ from, to ] of Object.entries( mappings ) ) {
					console.log( `  ${ chalk.red( from ) } → ${ chalk.green( to ) }` );
				}
			}
		} catch ( err ) {
			console.error( chalk.red( err.message ) );
			process.exit( 1 );
		}
		return;
	}

	// 1. Validate local project
	const spinner = ora( 'Validating local project…' ).start();
	try {
		validateLocalProject( localPath );
		spinner.succeed( `Local project: ${ chalk.underline( localPath ) }` );
	} catch ( err ) {
		spinner.fail( err.message );
		process.exit( 1 );
	}

	// 2. Resolve search-replace mappings (fail fast before any remote calls)
	let mappings;
	try {
		mappings = resolveMappings( localPath, searchReplaceKey, replacePairs, skipSearchReplace );
	} catch ( err ) {
		console.error( chalk.red( err.message ) );
		process.exit( 1 );
	}

	if ( Object.keys( mappings ).length === 0 ) {
		console.log( chalk.yellow(
			`No search-replace mappings found for key "${ searchReplaceKey }". Skipping search-replace. ` +
			`Configure them under extra.altis.cloud.search-replace.${ searchReplaceKey } in composer.json, or use --replace.`
		) );
	} else {
		console.log( chalk.dim( `Search-replace: ${ Object.keys( mappings ).length } mapping(s) from composer.json[${ searchReplaceKey }]` ) );
	}

	// 3. Choose backup (before confirm, so the user knows what they're agreeing to)
	const startTime = new Date();
	let logId = resume;
	let backup = null;

	if ( ! logId ) {
		backup = await promptBackupChoice( v, app );
	}

	// 4. Confirm with full context
	if ( ! yes ) {
		let confirmMsg;
		if ( backup ) {
			const age = formatAge( new Date( backup.date ) );
			confirmMsg = `Import backup ${ chalk.bold( backup.id ) } (${ chalk.dim( age + ' old' ) }) — replace local DB and merge uploads?`;
		} else if ( logId ) {
			confirmMsg = `Resume backup ${ chalk.bold( logId ) } and import DB + uploads into local project?`;
		} else {
			confirmMsg = `Create a new backup of ${ chalk.bold( app ) } and replace local DB and uploads?`;
		}
		await confirm( confirmMsg );
	}

	const workDir = outputDir || fs.mkdtempSync( path.join( tmpdir(), 'altis-sync-' ) );
	const archivePath = path.join( workDir, `${ app }.tar` );
	const extractDir = path.join( workDir, `${ app }-extracted` );

	try {
		// 5. Create backup if needed
		if ( ! backup && ! logId ) {
			const backupSpinner = ora( `Creating remote backup for ${ chalk.bold( app ) }…` ).start();
			const opts = {
				database: 1,
				uploads: 1,
				...( tables ? { tables: tables.split( ',' ) } : {} ),
				...( uploadsPath ? { uploads_path: uploadsPath } : {} ),
			};
			try {
				logId = await startBackup( v, app, opts );
				backupSpinner.succeed( `Backup started (log: ${ chalk.dim( logId ) })` );
				console.log( chalk.dim( `Resume later with: altis-cli stack sync all ${ app } --resume ${ logId }` ) );
			} catch ( err ) {
				backupSpinner.fail( `Failed to start backup: ${ err.message }` );
				process.exit( 1 );
			}
		}

		// 6. Wait for backup to complete (if creating new or resuming)
		if ( ! backup ) {
			console.log( chalk.bold( 'Streaming backup progress…' ) );
			await waitForBackup( v, app, logId, startTime, debug );

			// 7. Find completed backup
			const findSpinner = ora( 'Finding completed backup…' ).start();
			backup = await findCompletedBackup( v, app, startTime );
			if ( ! backup ) {
				findSpinner.fail(
					`Backup completed but no download URL found. Run:\n  altis-cli stack backups ${ app }`
				);
				process.exit( 1 );
			}
			findSpinner.succeed( `Backup: ${ chalk.dim( backup.id ) }` );
		}

		// 6. Download archive
		fs.mkdirSync( workDir, { recursive: true } );
		await downloadArchive( backup.url, archivePath );

		// 7. Extract
		const extractSpinner = ora( 'Extracting archive…' ).start();
		await extractArchive( archivePath, extractDir );
		const sqlGzPath = path.join( extractDir, 'database.sql.gz' );
		const uploadsDir = path.join( extractDir, 'uploads' );
		if ( ! fs.existsSync( sqlGzPath ) ) {
			extractSpinner.fail( 'database.sql.gz not found in archive.' );
			process.exit( 1 );
		}
		if ( ! fs.existsSync( uploadsDir ) ) {
			extractSpinner.fail( 'uploads/ not found in archive.' );
			process.exit( 1 );
		}
		extractSpinner.succeed( 'Extracted.' );

		// 8. Search-replace + import database
		console.log( chalk.bold( 'Importing database…' ) );
		await searchReplaceAndImport( sqlGzPath, mappings, localPath );

		// 9. Cache flush
		console.log( chalk.dim( 'Flushing object cache…' ) );
		await runComposerServer( localPath, [ 'cli', '--', 'cache', 'flush' ] );

		// 10. Post-sync hook
		if ( ! skipPostSync ) {
			console.log( chalk.dim( 'Running wp altis post-sync…' ) );
			await runPostSync( localPath );
		}

		// 11. Copy uploads + import into S3
		console.log( chalk.bold( 'Syncing uploads…' ) );
		const copySpinner = ora( 'Copying uploads to content/uploads…' ).start();
		copyUploads( extractDir, localPath );
		copySpinner.succeed( 'Uploads copied.' );

		console.log( chalk.dim( 'Syncing uploads to local S3…' ) );
		try {
			await runComposerServer( localPath, [ 's3', 'import-uploads' ] );
		} catch {
			await runComposerServer( localPath, [ 'import-uploads' ] );
		}

		console.log( chalk.bold.green( `\n✓ Database and uploads synced from ${ app }` ) );

	} catch ( err ) {
		console.error( chalk.red( `\nSync failed: ${ err.message }` ) );
		if ( fs.existsSync( archivePath ) || fs.existsSync( extractDir ) ) {
			console.log( chalk.dim( 'Kept files for debugging:' ) );
			if ( fs.existsSync( archivePath ) ) console.log( `  ${ archivePath }` );
			if ( fs.existsSync( extractDir ) ) console.log( `  ${ extractDir }` );
		}
		process.exit( 1 );
	}

	// 12. Cleanup
	if ( ! keepArchive ) {
		try {
			fs.rmSync( archivePath, { force: true } );
			fs.rmSync( extractDir, { recursive: true, force: true } );
		} catch {
			// Non-fatal
		}
	}
};

export default {
	command: 'all <app>',
	description: 'Sync database and uploads from a remote Vantage app into local-server.',
	builder: cmd => {
		addCommonOptions( cmd );
		addDatabaseOptions( cmd );
		addUploadsOptions( cmd );
	},
	handler,
};
