const open = require( 'open' );

const GitHubAPI = require( '../../github' );

function openCommand( argv ) {
	const api = new GitHubAPI();
	api.getRepo( process.cwd() ).then( repo => {
		open( `https://github.com/${repo}` );
	});
}

module.exports = function ( command ) {
	command.demandCommand( 1 );

	command.command(
		'open',
		'Open the repo in your browser',
		openCommand
	);
};
