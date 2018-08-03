const path = require( 'path' );

const Config = require( './config' );

class Cache extends Config {
	constructor() {
		super();

		// Modify the config object to use a different path.
		this.cfg.filePath = path.join( path.dirname( this.cfg.filePath ), 'cache.json' );
	}
}
Cache.defaults = {};

module.exports = Cache;
