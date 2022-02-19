const buildSubcommands = require( '../../buildSubcommands' );

module.exports = {
	command: 'stack',
	description: 'Stack commands',
	builder: function ( command ) {
		// Main configuration.
		command.demandCommand( 1 );
		command.command( buildSubcommands( __dirname ) );
	},
}
