const chalk = require( 'chalk' );
const inquirer = require( 'inquirer' );
const ora = require( 'ora' );

const { getStackRegion, streamLog } = require( './util' );
const Vantage = require( '../../vantage' );

function startBackup( vantage, stack, force ) {
	console.log( `Starting backup for ${stack}...` );

	const url = `stack/applications/${stack}/backups?stream=true`;

	const opts = { method: 'POST' };
	return vantage.fetch( url, opts ).then( resp => {
		console.log( resp );
		return resp.text().then( text => {
			if ( ! resp.ok ) {
				throw new Error( text );
			}

			return text;
		});
	});
}

module.exports = function ( argv ) {
	const { config, debug, force, stack } = argv;

	getStackRegion( argv ).then( region => {
		const v = new Vantage( config, region );
		if ( argv.resume ) {
			streamLog( v, stack, argv.resume, debug );
			return;
		}

		startBackup( v, stack ).then( id => {
			console.log( chalk.yellow( `Backup started, resume later with...` ) );
			console.log( chalk.yellow( `  hm stack backup ${stack} --resume ${id}\n` ) );
			streamLog( v, stack, id, debug );
		} );
	} );
};
