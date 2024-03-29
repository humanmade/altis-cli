const appCfg = require( 'application-config' );

const CFG_NAME = 'hm-cli';

class Config {
	constructor() {
		this.cfg = new appCfg( CFG_NAME );
		this.cache = null;
	}

	get path() {
		return this.cfg.filePath;
	}

	load() {
		if ( this.data ) {
			return Promise.resolve( this.data );
		}

		return new Promise( ( resolve, reject ) => {
			this.cfg.read( ( err, data ) => {
				if ( err ) {
					reject( err );
				} else {
					this.data = data;
					resolve( data );
				}
			});
		});
	}

	save() {
		return new Promise( (resolve, reject) => {
			this.cfg.write( this.data, err => {
				if ( err ) {
					reject( err );
				} else {
					resolve();
				}
			});
		});
	}

	reset() {
		this.data = this.constructor.defaults;
		return this.save();
	}

	get( key ) {
		return this.data[ key ] || this.constructor.defaults[ key ];
	}

	set( key, value ) {
		if ( typeof key !== "string" && typeof value === "undefined" ) {
			this.data = Object.assign( {}, this.data, key );
		} else {
			this.data[ key ] = value;
		}

		return this.save();
	}
}
Config.defaults = {
	didSetup: false,
	github: {},
}

module.exports = Config;
