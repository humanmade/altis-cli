const open = require( 'open' );

const GitHubAPI = require( '../../github' );

module.exports = argv => {
	const api = new GitHubAPI();
	api.getRepo( process.cwd() ).then( repo => {
		open( `https://github.com/${repo}` );
	});
};
