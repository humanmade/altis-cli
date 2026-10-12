import type { CliArguments, CommandBuilder, CommandDefinition } from '../../../types/cli.js';
import buildSubcommands from '../../../buildSubcommands.js';

export default {
	command: 'sync-local',
	describe: 'Sync data from a remote Altis Dashboard app into local-server.',
	builder: async function ( command: CommandBuilder ) {
		command.demandCommand( 1 );
		const subcommands = await buildSubcommands( new URL( '.', import.meta.url ).pathname );
		command.command( subcommands );
	},
} satisfies CommandDefinition;
