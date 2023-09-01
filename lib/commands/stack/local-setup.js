const bytes = require( 'bytes' );
const chalk = require( 'chalk' );
const fs = require( 'fs' );
const ora = require( 'ora' );
const process = require( 'process' );
const cmd = require( 'node-cmd' );

const Vantage = require( '../../vantage' );
const { getStack, streamLog } = require( './util' );

const handler = argv => {
	getStack( argv ).then( stack => {
		const v = new Vantage(argv.config);

		const status = new ora(`Loading repository for ${ stack }…`);
		status.start();

		v.fetch(`stack/applications/${ stack }`)
			.then( resp => resp.json() )
			.then( repo => {
				status.succeed();

				const url = repo['git-deployment']['url'];
				const branch = repo['git-deployment']['ref'];
				const dir = `./${stack}`;

				if ( !fs.existsSync( dir ) ){
					console.log( chalk.yellow( `Creating directory: ${ chalk.underline( dir ) }` ) );
					fs.mkdirSync(dir);
				}

				process.chdir(dir);

				console.log( chalk.yellow( `Cloning: ${ chalk.underline( url ) }` ) );
				cmd.runSync(`git clone --branch ${branch} ${url} ./`);

				console.log( chalk.yellow( `Installing dependencies…` ) );
				cmd.runSync('composer install');

				console.log( chalk.yellow( `${ chalk.underline( stack ) } is now available at ${ chalk.underline( dir ) }` ) );
				console.log( chalk.yellow( `Run \`composer server start\` to get started` ) );
			} );
	})
};

module.exports = {
    command: 'local-setup [stack]',
    description: 'Setup an existing Altis stack locally.',
    handler,
};
