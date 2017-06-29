const config = require( '../../config' );

function resetCommand() {
	config.reset().then( () => {
		console.log( 'Configuration reset.' )
	});
}

function statusCommand() {
	config.load()
		.then( data => {
			console.log( `Logged in as ${data.user}.` );
		})
		.catch( err => {
			console.log( `Not logged in. Run a GitHub command to authenticate (like "hm issues list").` );
		});
}

module.exports = function ( command ) {
	command.demandCommand( 1 );

	command.command(
		'reset',
		'Reset GitHub tokens',
		resetCommand
	);

	command.command(
		'status',
		'Show GitHub authentication status',
		statusCommand
	);
};
