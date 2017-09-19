const chalk = require( 'chalk' );
const { spawn } = require( 'child_process' );
const inquirer = require( 'inquirer' );
const ora = require( 'ora' );

const Vantage = require( '../../vantage' );

module.exports = function ( argv ) {
	const { config, region, stack } = argv;

	const v = new Vantage( config, region );

	const status = new ora( `Fetching servers for ${stack}@${region} (proxying via ${v.proxyRegion})` );
	status.start();

	const url = `stack/applications/${stack}/web-servers`;
	v.fetch( url ).then( resp => {
		// hm-stack currently returns a 500 for invalid stacks, so we have to
		// assume any failure is a 404: https://github.com/humanmade/hm-stack/issues/367
		if ( ! resp.ok ) {
			status.fail( `Invalid stack ${stack}` );
			return;
		}

		return resp.json().then( data => {
			status.succeed( `Found servers for ${stack}:` );
			data.forEach( item => {
				console.log( chalk.grey( `• ${item.id}: ` ) + `${item['ip-address']}` );
			});

			const ip = data[0]['ip-address'];
			console.log( `Connecting to ${ chalk.green( ip ) } via ${ chalk.green( region ) }…\n` );

			// Run SSH!
			const args = [
				`${v.proxyUser}@${region}.aws.hmn.md`,
				'-A',
				'-p 22',
				'-t',
				`ssh ubuntu@${ip}`
			];
			const ssh = spawn( 'ssh', args, {
				stdio: 'inherit'
			} );
		});
	}).catch( e => {
		status.fail( `Could not fetch details for ${stack}` );
		throw e;
	});
};