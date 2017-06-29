const GitHub = require( '../../github' );
const { spawn } = require( 'child_process' );

module.exports = function ( argv ) {
	const api = new GitHub();

	api.getRepo( process.cwd() ).then( repo => {
		const url = `https://github.com/${repo}/issues/${argv.number}`;
		spawn( 'open', [ url ] );
	});
};
