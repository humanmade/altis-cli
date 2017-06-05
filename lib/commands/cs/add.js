"use strict";
const ansiEscapes = require( 'ansi-escapes' );
const chalk = require( 'chalk' );
const diff = require( 'diff' );
const fs = require( 'fs' );
const inquirer = require( 'inquirer' );
const open = require( 'open' );
const path = require( 'path' );

const ComposerConfig = require( '../../ComposerConfig' );
const TravisConfig = require( '../../TravisConfig' );

const formatDiff = diff => diff.split( '\n' ).map( line => {
	switch ( line[0] ) {
		case '+':
			return chalk.green( line );

		case '-':
			return chalk.red( line );

		case '@':
			return chalk.bold( line );

		default:
			return line;
	}
});

const getDiffStat = diff => {
	const lines = diff.split( '\n' );
	// Remove lines.
	while ( ! lines[0].startsWith( '+++' ) ) {
		lines.shift();
	}
	lines.shift();
	return lines.reduce( ( stat, line ) => {
		switch( line[0] ) {
			case '+':
				stat.added++;
				break;

			case '-':
				stat.removed++;
				break;
		}
		return stat;
	}, { added: 0, removed: 0 } );
};

function promptWrite( sourcePath, currentData, newData ) {
	let willChange = diff.createTwoFilesPatch(
		currentData ? sourcePath : '/dev/null',
		sourcePath,
		currentData ? currentData : '',
		newData,
		'',
		'',
		{ context: 1 }
	);
	if ( ! currentData ) {
		// Remove the newline warning for old.
		willChange = willChange.replace( '\\ No newline at end of file\n', '' );
	}
	const diffStat = getDiffStat( willChange );

	const indented = formatDiff( willChange ).map( (line, idx) => `  ${line}` );
	process.stdout.write( indented.join( '\n' ) + '\n' );

	const filename = path.basename( sourcePath );
	const message = currentData ? `Save change to ${filename}?` : `Create ${filename}?`;
	return inquirer.prompt({
		type: 'confirm',
		name: 'save',
		message,
		default: true,
	}).then( answers => {
		// Erase diff...
		process.stdout.write( ansiEscapes.eraseLines( indented.length + 2 ) );

		// Print diffstat...
		if ( answers.save ) {
			const changes = [ '1 file changed' ];
			if ( diffStat.added === 1 ) {
				changes.push( '1 insertion(+)' );
			} else if ( diffStat.added > 1 ) {
				changes.push( `${diffStat.added} insertions(+)` );
			}
			if ( diffStat.removed === 1 ) {
				changes.push( '1 deletion(+)' );
			} else if ( diffStat.removed > 1 ) {
				changes.push( `${diffStat.removed} deletions(+)` );
			}
			process.stdout.write( changes.join( ', ' ) + '\n' );
		}

		// ...and recreate answer.
		process.stdout.write(
			chalk.green( '?' )
			+ ' '
			+ chalk.bold( message )
			+ ' '
			+ chalk.cyan( answers.save ? 'Yes' : ' No' )
			+ '\n'
		);
		return answers.save;
	});
}

function updateConfig( config, force ) {
	const path = config.path();
	let nextConfig;

	return config.check()
		.then( exists => {
			if ( ! exists ) {
				// New file, so use the defaults.
				return Promise.resolve( [ null, config.default() ] );
			}

			// Load the existing file, and add CS to it.
			return Promise.all([
				config.load(),
				config.withCS().catch( err => {
					if ( err === 'already_added' ) {
						process.stderr.write(
							chalk.red( 'phpcs is already in your config.\n' )
						);
						process.exit( 1 );
						return;
					}

					// Pass the error up.
					return Promise.reject( err );
				}),
			]);
		})
		.then( data => {
			nextConfig = data[1];

			if ( force ) {
				return true;
			}

			return promptWrite( path, data[0], data[1] );
		})
		.then( save => {
			if ( ! save ) {
				process.exit( 0 );
				return;
			}

			process.stdout.write( '\n' );
			return config.save( nextConfig );
		});
}

// function

module.exports = function ( argv ) {
	fs.realpath( argv.directory, ( err, directory ) => {
		if ( err ) {
			process.stderr.write( chalk.bold.red( `Directory ${argv.directory} not found\n` ) );
			process.exit( 1 );
			return;
		}

		const promises = [];
		const travis = new TravisConfig( directory );

		const composer = new ComposerConfig( directory );
		updateConfig( travis, argv.force )
			.then( () => updateConfig( composer, argv.force ) )
			.then( () => {
				process.stdout.write( chalk.green( 'Coding standards added.\n' ) );
				process.stdout.write( 'Before pushing, you need to activate this repository on Travis.\n\n' );
				inquirer.prompt({
					type: 'list',
					name: 'action',
					message: 'Open Travis configuration page for:',
					choices: [
						{
							name: 'Private repos',
							value: 'private',
						},
						{
							name: 'Public repos',
							value: 'public',
						},
						{
							name: 'Skip',
							value: 'skip',
						}
					],
					default: 'skip',
				}).then( answers => {
					switch ( answers.action ) {
						case 'private':
							open( 'https://travis-ci.com/profile/humanmade' );
							break;

						case 'public':
							open( 'https://travis-ci.org/profile/humanmade' );
							break;

						default:
							// No-op
							break;
					}
				});
			});
	});
};
