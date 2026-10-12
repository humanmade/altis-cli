import type { CommandBuilder, CommandDefinition } from '../../types/cli.js';
import buildSubcommands from '../../buildSubcommands.js';

export default {
	command: 'cli',
	describe: 'Meta CLI commands',
	builder: async (command: CommandBuilder) => {
		command.demandCommand(1);
		const subcommands = await buildSubcommands(new URL('.', import.meta.url).pathname);
		command.command(subcommands);
	},
} satisfies CommandDefinition;
