import buildSubcommands from '../../buildSubcommands.js';

export default {
	command: 'stack',
	description: 'Stack commands',
	builder: async function (command) {
		// Main configuration.
		command.demandCommand(1);
		const subcommands = await buildSubcommands(new URL('.', import.meta.url).pathname);
		command.command(subcommands);
	},
};
