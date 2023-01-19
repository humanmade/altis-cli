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
const process = require( 'process' );
const cmd = require( 'node-cmd' );

const Vantage = require( '../../vantage' );
const { getStack, streamLog } = require( './util' );

const getProgress = progress => {
	const { percentage, speed } = progress;
	let bar = Array( Math.floor( 45 * percentage / 100 ) ).join( '=' ) + '>'
	while ( bar.length < 45 ) {
		bar += ' ';
	}

	return `[${ bar }] ${ percentage.toFixed( 1 ) }% (${ bytes( speed ) }/s)`;
};

const handler = argv => {
	getStack( argv ).then( stack => {
		const v = new Vantage(argv.config);

		/*
		const status = new ora(`Loading repository for ${stack}…`);
		status.start();
		*/

		v.fetch(`stack/applications/${stack}`)
			.then( resp => resp.json() )
			.then( repo => {
				const url = repo['git-deployment']['url'];
				const branch = repo['git-deployment']['ref'];
				const dir = `./${stack}`;

				if (!fs.existsSync(dir)){
					console.log('Creating directory: ' + dir);
					fs.mkdirSync(dir);
				}

				process.chdir(dir);

				console.log(`Cloning ${url}`);
				cmd.runSync(`git clone --branch ${branch} ${url} ./`);

				console.log('Running `composer install`');
				cmd.runSync('composer install');

			} );
	})
};

module.exports = {
    command: 'local-setup [stack]',
    description: 'Setup an existing Altis stack locally.',
    handler,
};
