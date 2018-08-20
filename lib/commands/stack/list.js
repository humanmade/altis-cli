const chalk = require( 'chalk' );
const columnify = require( 'columnify' );
const inquirer = require( 'inquirer' );
const logUpdate = require( 'log-update' );
const ora = require( 'ora' );

const { renderCommit, renderRepo } = require( './util' );
const Vantage = require( '../../vantage' );

function askForRegion( argv ) {
	if ( argv.region ) {
		return Promise.resolve( argv.region );
	}

	const choices = Vantage.REGIONS;
	return inquirer.prompt( {
		type: 'list',
		name: 'region',
		message: 'Select region to list stacks from:',
		choices,
	} ).then( answers => answers.region );
}

module.exports = function ( argv ) {
	const { config } = argv;

	askForRegion( argv ).then( region => {
		const v = new Vantage( config, region );
		const vPromise = v.fetch( 'stack/applications' ).then( resp => resp.json() );

		const status = new ora( `Fetching applications for ${region} (proxying via ${v.proxyRegion})` );
		status.start();
		vPromise.then( data => {
			status.stop();

			const tableConfig = {
				columnSplitter: chalk.grey( ' | ' ),
				config: {
					issue: {
						minWidth: 5,
					},
					title: {
						truncate: true,
						maxWidth: 80,
					},
					commit: {
						truncate: true,
						maxWidth: 35
					},
				},
				headingTransform: name => chalk.blue( name.toUpperCase() ),
			};

			const values = data.map(item => ({
				stack: item.id,
				repo: item['git-deployment'].url ? renderRepo( item['git-deployment'].url ) : '',
				branch: item['git-deployment'].ref,
				commit: item['git-deployment'].branch_details ? renderCommit( item['git-deployment'].branch_details.latest_commit ) : '',
				version: item.version,
			}));
			console.log( columnify( values, tableConfig ) );
		})
		.catch( e => {
			status.stop();
			throw e;
		});
	} );
};
