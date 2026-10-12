import type { CommandBuilder, CommandDefinition } from '../../types/cli.js';
import buildSubcommands from '../../buildSubcommands.js';

export default {
	command: 'config',
	describe: 'Configuration commands',
	builder: async (command: CommandBuilder) => {
		command.demandCommand(1);
		const subcommands = await buildSubcommands(new URL('.', import.meta.url).pathname);
		command.command(subcommands);
	},
} satisfies CommandDefinition;
