const buildSubcommands = require( '../../buildSubcommands' );

module.exports = {
	command: 'cli',
	description: 'Meta CLI commands',
	builder: command => {
		command.demandCommand( 1 );
		command.command( buildSubcommands( __dirname ) );
	},
};
