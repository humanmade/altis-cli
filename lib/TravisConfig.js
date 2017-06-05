"use strict";
const yaml = require( 'js-yaml' );
const path = require( 'path' );

const ConfigFile = require( './ConfigFile' );

const COMMAND = 'vendor/bin/phpcs --standard=vendor/humanmade/coding-standards .';

class TravisConfig extends ConfigFile {
	withCS() {
		return this.load().then( data => new Promise( (resolve, reject) => {
			const config = yaml.safeLoad( data );

			const nextConfig = Object.assign( {}, config );
			if ( ! nextConfig.language ) {
				nextConfig.language = 'php';
			}
			if ( ! nextConfig.php ) {
				nextConfig.php = [ '7.1' ];
			}

			// Add the CS script.
			if ( ! nextConfig.script ) {
				nextConfig.script = COMMAND;
			} else {
				// Check for an existing script.
				const matched = nextConfig.script.filter( command => command.indexOf( 'phpcs' ) >= 0 );
				if ( matched.length ) {
					reject( 'already_added' );
					return;
				}

				// Insert as first item.
				nextConfig.script.unshift( COMMAND );
			}

			// Return the new YAML data, ready to save.
			resolve( yaml.safeDump( nextConfig ) );
		}));
	}

	default() {
		return yaml.safeDump( TravisConfig.defaultValues );
	}
};
TravisConfig.filename = '.travis.yml';
TravisConfig.defaultValues = {
	language: 'php',
	php: [
		'7.1',
	],
	script: [
		COMMAND,
		'test -f "phpunit.xml"'
	],
};

module.exports = TravisConfig;
