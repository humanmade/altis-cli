"use strict";
const chalk = require( 'chalk' );
const fs = require( 'fs' );
const inquirer = require( 'inquirer' );
const open = require( 'open' );
const path = require( 'path' );

const TravisConfig = require( '../../TravisConfig' );
const StaticFile = require( '../../StaticFile' );
const diffUtils = require( '../../diff-utils' );

function getStaticFiles( directory, filemap ) {
	const promises = Object.entries( filemap ).map( ([ dest, tmpl ]) => new Promise( (resolve, reject) => {
		fs.readFile( path.join( __dirname, 'templates', tmpl ), ( err, data ) => {
			if ( err ) {
				return reject( err );
			}

			resolve( new StaticFile( directory, dest, '' + data ) );
		});
	}))
	return Promise.all( promises );
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
				config.withPHPUnit().catch( err => {
					if ( err === 'already_added' ) {
						process.stderr.write(
							chalk.red( 'PHPUnit is already in your config.\n' )
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

			return diffUtils.promptWrite( path, data[0], data[1] );
		})
		.then( save => {
			if ( ! save ) {
				process.exit( 0 );
				return;
			}

			return config.save( nextConfig );
		});
}

module.exports = function ( argv ) {
	fs.realpath( argv.directory, ( err, directory ) => {
		if ( err ) {
			process.stderr.write( chalk.bold.red( `Directory ${argv.directory} not found\n` ) );
			process.exit( 1 );
			return;
		}

		const travis = new TravisConfig( directory );
		const filemap = {
			'phpunit.xml.dist': 'phpunit.xml.dist',
			'tests/bootstrap.php': 'bootstrap.php',
			'tests/install-tests.sh': 'install-tests.sh',
		};
		const fileConfigs = getStaticFiles( directory, filemap );

		// Create the `tests` directory.
		const testsDir = new Promise( (resolve, reject ) => {
			fs.mkdir( path.join( directory, 'tests' ), err => {
				if ( err && err.code !== 'EEXIST' ) {
					return reject( err );
				}
				return resolve();
			})
		});

		updateConfig( travis, argv.force )
			.then( () => testsDir )
			.then( () => fileConfigs )
			// Chain all the static file checks together and run sequentially
			.then( configs => configs.reduce(
				(promise, config) => promise.then( () => updateConfig( config, argv.force ) ),
				Promise.resolve( true )
			))
			.then( () => new Promise( (resolve, reject) => {
				fs.chmod( path.join( directory, 'tests', 'install-tests.sh' ), 0o777, err => {
					if ( err ) {
						return reject( err );
					} else {
						return resolve();
					}
				});
			}))
			.then( () => {
				process.stdout.write( chalk.green( 'Tests added.\n' ) );
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
