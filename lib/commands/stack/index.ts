import type { CommandBuilder, CommandDefinition } from '../../types/cli.js';
import buildSubcommands from '../../buildSubcommands.js';

export default {
	command: 'stack',
	describe: 'Stack commands',
	builder: async function (command: CommandBuilder) {
		// Main configuration.
		command.demandCommand(1);
		const subcommands = await buildSubcommands(new URL('.', import.meta.url).pathname);
		command.command(subcommands);
	},
} satisfies CommandDefinition;
