"use strict";
const fs = require( 'fs' );
const yaml = require( 'js-yaml' );
const path = require( 'path' );

class ConfigFile {
	constructor( directory ) {
		this.directory = directory;
		this.config = null;
	}

	path() {
		return path.join( this.directory, this.constructor.filename );
	}

	check() {
		return new Promise( ( resolve, reject ) => {
			fs.access( this.path(), fs.R_OK, err => {
				if ( ! err ) {
					resolve( true );
					return;
				}
				// ENOENT: doesn't exist, OK.
				if ( err.code === 'ENOENT' ) {
					resolve( false );
					return;
				}

				// Anything else: error.
				reject( err );
			});
		});
	}

	load() {
		if ( this.config ) {
			return this.config;
		}

		this.config = new Promise( ( resolve, reject ) => {
			// Carefully merge.
			fs.readFile( this.path(), ( err, data ) => {
				if ( err ) {
					reject( err );
					return;
				}

				this.config = '' + data;
				resolve( this.config );
			});
		});
		return this.config;
	}

	save( data ) {
		return new Promise( (resolve, reject) => fs.writeFile( this.path(), data, err => {
			if ( err ) {
				reject( err );
			} else {
				resolve();
			}
		}));
	}
};

module.exports = ConfigFile;
