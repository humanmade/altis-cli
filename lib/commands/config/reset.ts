import type { CliArguments, CommandDefinition } from '../../types/cli.js';
import inquirer from 'inquirer';

const handler = (argv: CliArguments) => {
	inquirer.prompt({
		type: 'confirm',
		name: 'sure',
		message: 'Are you sure you want to reset your configuration?',
		default: false,
	}).then(({ sure }) => {
		if (!sure) {
			return;
		}
		return argv.config.reset().then(() => {
			console.log('Configuration reset.');
		});
	});
};

export default {
	command: 'reset',
	describe: 'Reset configuration',
	handler,
} satisfies CommandDefinition;
