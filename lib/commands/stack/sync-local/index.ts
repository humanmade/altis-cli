import { fileURLToPath } from 'node:url';
import type { CliArguments, CommandBuilder, CommandDefinition } from '../../../types/cli.ts';
import buildSubcommands from '../../../buildSubcommands.ts';

export default {
	command: 'sync-local',
	describe: 'Sync data from a remote Altis Dashboard app into local-server.',
	builder: async function ( command: CommandBuilder ) {
		command.demandCommand( 1 );
		const subcommands = await buildSubcommands( fileURLToPath(new URL( '.', import.meta.url )) );
		command.command( subcommands );
	},
} satisfies CommandDefinition;
