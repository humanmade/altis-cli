"use strict";
const ConfigFile = require( './ConfigFile' );

const PACKAGE = "humanmade/coding-standards";

class ComposerConfig extends ConfigFile {
	withCS() {
		return this.load().then( data => new Promise( (resolve, reject) => {
			const config = JSON.parse( data );
			const nextConfig = Object.assign( {}, config );

			// Add the CS script.
			if ( ! nextConfig['require-dev'] ) {
				nextConfig['require-dev'] = {};
				nextConfig['require-dev'][ PACKAGE ] = 'dev-master';
			} else {
				// Check for an existing package.
				if ( PACKAGE in nextConfig['require-dev'] ) {
					reject( 'already_added' );
					return;
				}

				// Insert as first item.
				nextConfig['require-dev'][ PACKAGE ] = 'dev-master';
			}

			// Return the new YAML data, ready to save.
			resolve( JSON.stringify( nextConfig, null, '\t' ) + '\n' );
		}));
	}
	default() {
		const defaultConfig = { 'require-dev': {} };
		defaultConfig['require-dev'][ PACKAGE ] = 'dev-master';

		return JSON.stringify( defaultConfig ) + '\n';
	}
}
ComposerConfig.filename = 'composer.json';

module.exports = ComposerConfig;
