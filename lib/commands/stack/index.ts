import { fileURLToPath } from 'node:url';
import type { CommandBuilder, CommandDefinition } from '../../types/cli.ts';
import buildSubcommands from '../../buildSubcommands.ts';

export default {
	command: 'stack',
	describe: 'Stack commands',
	builder: async function (command: CommandBuilder) {
		// Main configuration.
		command.demandCommand(1);
		const subcommands = await buildSubcommands(fileURLToPath(new URL('.', import.meta.url)));
		command.command(subcommands);
	},
} satisfies CommandDefinition;
