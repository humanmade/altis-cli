const fs = require( 'fs' );
const path = require( 'path' );

function getIndexes( root ) {
	const avail = [];

	fs.readdirSync( root ).forEach( function ( filename ) {
		const abs = path.join( root, filename );

		if ( ! fs.statSync( abs ).isDirectory() ) {
			// Files in this directory.
			if ( filename === 'index.js' || ! filename.match( /\.js$/ ) ) {
				return;
			}

			avail.push( abs );
			return;
		}

		// Check for index.
		const indexPath = path.join( abs, 'index.js' );
		if ( ! fs.statSync( indexPath ) ) {
			return;
		}

		avail.push( indexPath );
	} );

	return avail;
}

module.exports = function buildSubcommands( dir ) {
	const commands = [];
	getIndexes( dir ).forEach( indexPath => {
		commands.push( require( indexPath ) );
	} );
	return commands;
};
