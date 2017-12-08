const bytes = require( 'bytes' );
const chalk = require( 'chalk' );
const clipboardy = require( 'clipboardy' );
const fs = require( 'fs' );
const inquirer = require( 'inquirer' );
const fetch = require( 'node-fetch' );
const logUpdate = require( 'log-update' );
const ora = require( 'ora' );
const path = require( 'path' );
const progressStream = require( 'progress-stream' );
const unusedFilename = require( 'unused-filename' );

const Vantage = require( '../../vantage' );
const { getStackRegion, streamLog } = require( './util' );

const getProgress = progress => {
	const { percentage, speed } = progress;
	let bar = Array( Math.floor( 45 * percentage / 100 ) ).join( '=' ) + '>'
	while ( bar.length < 45 ) {
		bar += ' ';
	}

	return `[${ bar }] ${ percentage.toFixed( 1 ) }% (${ bytes( speed ) }/s)`;
};

module.exports = argv => {
	const { stack } = argv;
	getStackRegion( argv ).then( region => {
		const v = new Vantage( argv.config, region );

		const status = new ora( `Loading backups for ${ stack }@${ region } (proxying via ${ v.proxyRegion })…` );
		status.start();

		v.fetch( `stack/applications/${ stack }/backups` )
			.then( resp => resp.json() )
			.then( backups => {
				status.succeed();

				const latest = backups.slice();
				latest.sort( ( a, b ) => {
					const aTime = new Date( a.date );
					const bTime = new Date( b.date );

					return bTime - aTime;
				} );

				const rows = latest.map( row => {
					return {
						name: `${ row.id } ${ chalk.grey( `(${ bytes( row.size ) })` ) }`,
						value: row,
						short: row.id,
					};
				} );

				return inquirer.prompt({
					type: 'list',
					name: 'backup',
					message: 'Select backup to download:',
					choices: rows,
				});
			} )
			.then( choices => choices.backup )
			.then( row => {
				const downloadPath = path.join( process.env.HOME, 'Downloads', row.id );
				return unusedFilename( downloadPath ).then( path => {
					return Object.assign( {}, row, { path: path } );
				} );
			} )
			.then( row => {
				const output = fs.createWriteStream( row.path );
				console.log( chalk.yellow( `Downloading to ${ chalk.underline( row.path ) }` ) );
				const status = new ora( `Downloading…` );
				status.start();
				const progress = new progressStream( {
					length: row.size,
				} );
				progress.on( 'progress', progress => {
					status.text = getProgress( progress );
				} );

				fetch( row.url )
					.then( resp => {
						resp.body
							.pipe( progress )
							.pipe( output )
							.on( 'close', () => {
								clipboardy.writeSync( row.path );
								status.succeed( `${ chalk.bold( 'Downloaded.' ) } Copied ${ chalk.bold( row.path ) } to clipboard.` );
							} );
					} );
			});
	} );
};
