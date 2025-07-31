import buildSubcommands from '../../buildSubcommands.js';

export default {
	command: 'cli',
	description: 'Meta CLI commands',
	builder: async command => {
		command.demandCommand(1);
		const subcommands = await buildSubcommands(new URL('.', import.meta.url).pathname);
		command.command(subcommands);
	},
};
