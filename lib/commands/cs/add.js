"use strict";
const chalk = require( 'chalk' );
const fs = require( 'fs' );
const inquirer = require( 'inquirer' );
const open = require( 'open' );

const ComposerConfig = require( '../../ComposerConfig' );
const TravisConfig = require( '../../TravisConfig' );
const diffUtils = require( '../../diff-utils' );

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

			return diffUtils.promptWrite( path, data[0], data[1] );
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
