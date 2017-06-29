const appCfg = require( 'application-config' );

const CFG_NAME = 'hm-cli';

function load() {
	return new Promise( ( resolve, reject ) => {
		const cfg = new appCfg( CFG_NAME );

		cfg.read( ( err, data ) => {
			if ( err ) {
				reject( err );
			} else {
				resolve( data );
			}
		});
	});
}

function reset() {
	return new Promise( ( resolve, reject ) => {
		const cfg = new appCfg( CFG_NAME );

		cfg.trash( err => {
			if ( err ) {
				reject( err );
			} else {
				resolve();
			}
		});
	});
}

module.exports = {
	CFG_NAME,
	load,
	reset
};
