import buildSubcommands from '../../../buildSubcommands.js';

export default {
	command: 'sync-local',
	description: 'Sync data from a remote Altis Dashboard app into local-server.',
	builder: async function ( command ) {
		command.demandCommand( 1 );
		const subcommands = await buildSubcommands( new URL( '.', import.meta.url ).pathname );
		command.command( subcommands );
	},
};
