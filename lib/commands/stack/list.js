const chalk = require( 'chalk' );
const columnify = require( 'columnify' );
const logUpdate = require( 'log-update' );
const ora = require( 'ora' );

const Vantage = require( '../../vantage' );

function renderRepo( item ) {
	const repo = item['git-deployment'].url;
	const matches = repo.match( /git@github.com:([\w\-\.]+)\/([\w\-\.]+).git/i );
	if ( ! matches ) {
		return repo;
	}

	const user = matches[1] === 'humanmade' ? chalk.dim( matches[1] ) : matches[1];
	return `${user}/${matches[2]}`;
}

function renderCommit( item ) {
	const commit = item['git-deployment'].branch_details.latest_commit;

	return `${commit.rev.substring(0, 5)} (${commit.description})`;
}

module.exports = function ( argv ) {
	const { config, region } = argv;

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
			repo: renderRepo( item ),
			branch: item['git-deployment'].ref,
			commit: renderCommit( item ),
			version: item.version,
		}));
		console.log( columnify( values, tableConfig ) );
	})
	.catch( e => console.log( e ) );
};
