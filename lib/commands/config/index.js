const buildSubcommands = require( '../../buildSubcommands' );

module.exports = {
	command: 'config',
	description: 'Configuration commands',
	builder: ( command ) => {
		command.demandCommand( 1 );
		command.command( buildSubcommands( __dirname ) );
	},
};
