"use strict";
const path = require( 'path' );

const ConfigFile = require( './ConfigFile' );

class StaticFile extends ConfigFile {
	constructor( directory, filename, content ) {
		super( directory );

		this.filename = filename;
		this.content = content;
	}

	path() {
		return path.join( this.directory, this.filename );
	}

	default() {
		return this.content;
	}

	withPHPUnit() {
		return Promise.reject( 'already_added' );
	}
}

module.exports = StaticFile;
