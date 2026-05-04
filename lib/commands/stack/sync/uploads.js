import chalk from 'chalk';
import fs from 'fs';
import ora from 'ora';
import path from 'path';
import { tmpdir } from 'os';

import Vantage from '../../../vantage.js';
import {
	addCommonOptions,
	addUploadsOptions,
	confirm,
	copyUploads,
	downloadArchive,
	extractArchive,
	findCompletedBackup,
	formatAge,
	getLatestBackup,
	promptBackupChoice,
	runComposerServer,
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
		siteId,
		outputDir,
		keepArchive,
		yes,
		latest,
		resume,
		debug,
	} = argv;

	if ( siteId && siteId.length > 1 ) {
		console.error( chalk.red( 'Error: --site-id only accepts a single value for uploads sync.' ) );
		process.exit( 1 );
	}

	// Site ID 1 is the main site — its uploads are at the root, not sites/1/
	let resolvedUploadsPath = uploadsPath;
	if ( siteId?.length ) {
		if ( Number( siteId[0] ) === 1 ) {
			console.log( chalk.yellow( 'Note: site ID 1 is the main site — syncing all uploads.' ) );
			resolvedUploadsPath = null;
		} else {
			resolvedUploadsPath = `sites/${ siteId[0] }`;
		}
	}

	const localPath = pathOpt || process.cwd();
	const v = new Vantage( config );

	// 1. Validate local project
	const spinner = ora( 'Validating local project…' ).start();
	try {
		validateLocalProject( localPath );
		spinner.succeed( `Local project: ${ chalk.underline( localPath ) }` );
	} catch ( err ) {
		spinner.fail( err.message );
		process.exit( 1 );
	}

	// 2. Choose backup (before confirm, so the user knows what they're agreeing to)
	const startTime = new Date();
	let logId = resume;
	let backup = null;

	if ( latest ) {
		backup = await getLatestBackup( v, app );
		if ( ! backup ) {
			console.error( chalk.red( `No existing backup found for ${ chalk.bold( app ) }.` ) );
			process.exit( 1 );
		}
		const age = formatAge( new Date( backup.date ) );
		console.log( chalk.dim( `Using latest backup: ${ backup.id } (${ age } old)` ) );
	} else if ( ! logId ) {
		backup = await promptBackupChoice( v, app );
	}

	// 3. Confirm with full context (--latest implies --yes)
	if ( ! yes && ! latest ) {
		let confirmMsg;
		if ( backup ) {
			const age = formatAge( new Date( backup.date ) );
			confirmMsg = `Merge uploads from backup ${ chalk.bold( backup.id ) } (${ chalk.dim( age + ' old' ) }) into ./content/uploads? Existing files may be overwritten.`;
		} else if ( logId ) {
			confirmMsg = `Resume backup ${ chalk.bold( logId ) } and sync uploads into ./content/uploads? Existing files may be overwritten.`;
		} else {
			confirmMsg = `Create a new uploads backup of ${ chalk.bold( app ) } and sync into ./content/uploads? Existing files may be overwritten.`;
		}
		await confirm( confirmMsg );
	}

	const workDir = outputDir || fs.mkdtempSync( path.join( tmpdir(), 'altis-sync-' ) );
	const archivePath = path.join( workDir, `${ app }.tar` );
	const extractDir = path.join( workDir, `${ app }-extracted` );

	try {
		// 4. Create backup if needed
		if ( ! backup && ! logId ) {
			const backupSpinner = ora( `Creating remote uploads backup for ${ chalk.bold( app ) }…` ).start();
			const opts = {
				database: 0,
				uploads: 1,
				...( resolvedUploadsPath ? { uploads_path: resolvedUploadsPath } : {} ),
			};
			try {
				logId = await startBackup( v, app, opts );
				backupSpinner.succeed( `Backup started (log: ${ chalk.dim( logId ) })` );
				console.log( chalk.dim( `Resume later with: altis-cli app sync-local uploads ${ app } --resume ${ logId }` ) );
			} catch ( err ) {
				backupSpinner.fail( `Failed to start backup: ${ err.message }` );
				process.exit( 1 );
			}
		}

		// 5. Wait for backup to complete (if creating new or resuming)
		if ( ! backup ) {
			console.log( chalk.bold( 'Streaming backup progress…' ) );
			await waitForBackup( v, app, logId, startTime, debug );

			// 6. Find completed backup
			const findSpinner = ora( 'Finding completed backup…' ).start();
			backup = await findCompletedBackup( v, app, startTime );
			if ( ! backup ) {
				findSpinner.fail(
					`Backup completed but no download URL found. Run:\n  altis-cli app backups ${ app }`
				);
				process.exit( 1 );
			}
			findSpinner.succeed( `Backup: ${ chalk.dim( backup.id ) }` );
		}

		// 6. Download archive
		fs.mkdirSync( workDir, { recursive: true } );
		await downloadArchive( backup.url, archivePath );

		// 7. Extract and copy uploads
		const extractSpinner = ora( 'Extracting archive…' ).start();
		await extractArchive( archivePath, extractDir );
		const uploadsDir = path.join( extractDir, 'uploads' );
		if ( ! fs.existsSync( uploadsDir ) ) {
			extractSpinner.fail( 'uploads/ not found in archive.' );
			process.exit( 1 );
		}
		extractSpinner.succeed( 'Extracted.' );

		const copySpinner = ora( 'Copying uploads to content/uploads…' ).start();
		copyUploads( extractDir, localPath );
		copySpinner.succeed( 'Uploads copied.' );

		// 8. Sync into local-server S3
		console.log( chalk.dim( 'Syncing uploads to local S3…' ) );
		try {
			await runComposerServer( localPath, [ 's3', 'import-uploads' ] );
		} catch {
			await runComposerServer( localPath, [ 'import-uploads' ] );
		}

		console.log( chalk.bold.green( `\n✓ Uploads synced from ${ app }` ) );

	} catch ( err ) {
		console.error( chalk.red( `\nSync failed: ${ err.message }` ) );
		if ( fs.existsSync( archivePath ) || fs.existsSync( extractDir ) ) {
			console.log( chalk.dim( 'Kept files for debugging:' ) );
			if ( fs.existsSync( archivePath ) ) console.log( `  ${ archivePath }` );
			if ( fs.existsSync( extractDir ) ) console.log( `  ${ extractDir }` );
		}
		process.exit( 1 );
	}

	// 9. Cleanup
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
	command: 'uploads <app>',
	description: 'Sync uploads from a remote Altis Dashboard app into local-server.',
	builder: cmd => {
		addCommonOptions( cmd );
		addUploadsOptions( cmd );
	},
	handler,
};
