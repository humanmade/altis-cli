"use strict";
const yaml = require( 'js-yaml' );
const path = require( 'path' );

const ConfigFile = require( './ConfigFile' );

const CS_COMMAND = 'vendor/bin/phpcs --standard=vendor/humanmade/coding-standards .';
const PHPUNIT_COMMAND = 'phpunit';
const INSTALL_COMMAND = "bash tests/install-tests.sh wordpress_test root '' 127.0.0.1 latest";

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
			if ( ! nextConfig.install ) {
				nextConfig.install = [ 'composer install' ];
			} else {
				const matched = nextConfig.install.filter( command => command.indexOf( 'composer' ) >= 0 );
				if ( ! matched.length ) {
					matched.install.unshift( 'composer install' );
				}
			}

			// Add the CS script.
			if ( ! nextConfig.script ) {
				nextConfig.script = [ CS_COMMAND ];
			} else {
				// Check for an existing script.
				const matched = nextConfig.script.filter( command => command.indexOf( 'phpcs' ) >= 0 );
				if ( matched.length ) {
					reject( 'already_added' );
					return;
				}

				// Insert as first item.
				nextConfig.script.unshift( CS_COMMAND );
			}

			// Return the new YAML data, ready to save.
			resolve( yaml.safeDump( nextConfig ) );
		}));
	}

	withPHPUnit() {
		return this.load().then( data => new Promise( (resolve, reject) => {
			const config = yaml.safeLoad( data );

			const nextConfig = Object.assign( {}, config );
			if ( ! nextConfig.language ) {
				nextConfig = 'php';
			}
			if ( ! nextConfig.php ) {
				nextConfig.php = [ '7.1' ];
			}

			if ( ! nextConfig.install ) {
				nextConfig.install = [ INSTALL_COMMAND ];
			} else {
				const matched = nextConfig.install.filter( command => command.indexOf( 'install-wp-tests' ) >= 0 );
				if ( ! matched.length ) {
					nextConfig.install.push( INSTALL_COMMAND );
				}
			}

			if ( ! nextConfig.script ) {
				nextConfig.script = [ PHPUNIT_COMMAND ];
			} else {
				// Check for an existing script
				const matched = nextConfig.script.filter( command => command.indexOf( 'phpunit' ) >= 0 );
				if ( matched.length ) {
					reject( 'already_added' );
					return;
				}

				// Insert as first item.
				nextConfig.script.unshift( PHPUNIT_COMMAND );
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
	install: [
		'composer install',
	],
	script: [
		CS_COMMAND,
	],
};

module.exports = TravisConfig;
