const chalk = require( 'chalk' );
const columnify = require( 'columnify' );
const logUpdate = require( 'log-update' );
const ora = require( 'ora' );

const GitHubAPI = require( '../../github' );

function getPRs( repo, args = {} ) {
	const api = new GitHubAPI();

	const query = Object.keys( args ).map( key => `${key}=${args[key]}` ).join( '&' );
	const url = `/repos/${repo}/pulls${query ? '?' + query : ''}`;

	return api.fetch( url ).then( resp => resp.json() )
}

function renderStatus( item ) {
	const status = item.buildStatus;
	if ( ! status ) {
		if ( ! item._statusSpinner ) {
			item._statusSpinner = new ora();
		}
		return item._statusSpinner.frame();
	}

	switch ( status ) {
		case 'success':
			return chalk.green( '✔ ' );

		case 'failure':
			return chalk.red( '✖︎ ' );

		case 'pending':
			return chalk.yellow( '● ' );

		case 'none':
			return chalk.grey( '? ' );
	}

}

function renderItem( item, me ) {
	return {
		issue: chalk.red( `#${item.number}` ),
		title: renderStatus( item ) + item.title,
		milestone: item.milestone ?
			`#${item.milestone.number} ` + chalk.yellow( `(${item.milestone.title})` ) :
			'',
		assignee: item.assignees
			.map( user => user.login )
			.map( user => user === me ? chalk.yellow( user ) : user )
			.join( ',' )
	};
}

module.exports = function ( argv ) {
	const api = new GitHubAPI();

	api.authenticate().then( auth => {
		const opts = {};
		if ( argv.mine ) {
			opts.assignee = auth.user;
		}

		const issues = api.getRepo( process.cwd() ).then( repo => {
			const loader = new ora( `Fetching PRs for ${repo}…` );
			loader.start();
			getPRs( repo, opts ).then( data => {
				loader.stop();
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
						milestone: {
							truncate: true,
							maxWidth: 35,
						}
					},
					headingTransform: name => chalk.blue( name.toUpperCase() ),
				};

				// Load statuses for everything.
				const statusFetches = data.map( item => {
					const url = `/repos/${repo}/commits/${item.head.sha}/status`;
					return api.fetch( url ).then( resp => resp.json() ).then( data => {
						if ( data.total_count < 1 ) {
							item.buildStatus = 'none';
						} else {
							item.buildStatus = data.state;
						}
					});
				});

				const render = () => {
					const values = data.map( item => renderItem( item, auth.user ) );
					logUpdate( columnify( values, tableConfig ) );
				};

				render();
				const renderLoop = setInterval( () => render(), 50 );
				Promise.all( statusFetches ).then( () => {
					clearInterval( renderLoop );
					render();
				});
			}).catch( err => {
				loader.stop();
				throw err;
			});
		});
	});
};
