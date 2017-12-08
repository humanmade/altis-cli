const chalk = require( 'chalk' );
const inquirer = require( 'inquirer' );
const ora = require( 'ora' );
const { format, parse } = require( 'url' );

const { getStackRegion, streamLog } = require( './util' );
const Vantage = require( '../../vantage' );

function startBackup( vantage, stack, args ) {
	console.log( `Starting backup for ${stack}...` );

	const urlBits = parse( `stack/applications/${stack}/backups`, true );

	urlBits.query = Object.assign(
		{},
		args,
		{ stream: 'true' }
	);

	const url = format( urlBits );

	const opts = { method: 'POST' };
	return vantage.fetch( url, opts ).then( resp => {
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

		const opts = {
			database: argv.database ? 1 : 0,
			uploads:  argv.uploads  ? 1 : 0,
		};
		startBackup( v, stack, opts ).then( id => {
			console.log( chalk.yellow( `Backup started, resume later with...` ) );
			console.log( chalk.yellow( `  hm stack backup ${stack} --resume ${id}\n` ) );
			streamLog( v, stack, id, debug );
		} );
	} );
};
