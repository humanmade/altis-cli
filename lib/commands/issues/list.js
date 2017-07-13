const chalk = require( 'chalk' );
const columnify = require( 'columnify' );
const ora = require( 'ora' );

const GitHubAPI = require( '../../github' );

function getIssues( repo, args = {} ) {
	const api = new GitHubAPI();

	const query = Object.keys( args ).map( key => `${key}=${args[key]}` ).join( '&' );
	const url = `/repos/${repo}/issues${query ? '?' + query : ''}`;

	return api.fetch( url ).then( resp => resp.json() )
}

module.exports = function ( argv ) {
	const api = new GitHubAPI( argv.config );

	api.authenticate().then( auth => {
		const opts = {};
		if ( argv.mine ) {
			opts.assignee = auth.user;
		}

		const issues = api.getRepo( process.cwd() ).then( repo => {
			const loader = new ora( `Fetching issues for ${repo}…` );
			loader.start();
			getIssues( repo, opts ).then( data => {
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

				const values = data.map( item => ({
					issue: chalk.red( `#${item.number}` ),
					title: item.title,
					milestone: item.milestone ?
						`#${item.milestone.number} ` + chalk.yellow( `(${item.milestone.title})` ) :
						'',
					assignee: item.assignees
						.map( user => user.login )
						.map( user => user === auth.user ? chalk.yellow( user ) : user )
						.join( ',' )
				}));

				console.log( columnify( values, tableConfig ) );
			});
		});
	});
};
