const chalk = require( 'chalk' );
const { spawn } = require( 'child_process' );
const inquirer = require( 'inquirer' );
const ora = require( 'ora' );

const { getStackRegion } = require( './util' );
const Vantage = require( '../../vantage' );

module.exports = function ( argv ) {
	const { config } = argv;

	getStackRegion( argv ).then( ( { region, stack } ) => {
		const v = new Vantage( config, region );

		const status = new ora( `Fetching servers for ${stack}@${region} (proxying via ${v.proxyRegion})` );
		status.start();

		const useAppServer = argv.appServer;
		const url = `stack/applications/${stack}/${useAppServer ? 'web-servers' : 'sandbox-server'}`;
		v.fetch( url ).then( resp => {
			// hm-stack currently returns a 500 for invalid stacks, so we have to
			// assume any failure is a 404: https://github.com/humanmade/hm-stack/issues/367
			if ( ! resp.ok ) {
				status.fail( `Invalid stack ${stack}` );
				return;
			}

			return resp.json().then( data => {
				if ( useAppServer ) {
					status.succeed( `Found app servers for ${stack}:` );
					data.forEach( item => {
						console.log( chalk.grey( `• ${item.id}: ` ) + `${item['ip-address']}` );
					});
				} else {
					status.succeed( `Found sandbox server for ${stack}:` );
					console.log( chalk.grey( `• ${data.id}: ` ) + `${data['ip-address']}` );
				}

				const item = useAppServer ? data[0] : data;

				const ip = item['ip-address'];
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
	} );
};