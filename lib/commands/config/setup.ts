import type { CliArguments, CommandDefinition } from '../../types/cli.ts';
import chalk from 'chalk';
import inquirer from 'inquirer';

const handler = function (argv: CliArguments) {
	const { config } = argv;
	const vantage = config.get('vantage_token');

	const questions = [];
	if (vantage) {
		questions.push({
			type: "confirm",
			name: "resetVantage",
			message: `Logged in to Altis Dashboard. Reset?`,
			default: false,
		});
	}
	return inquirer.prompt(questions).then(answers => {
		const nextConfig = Object.assign({}, answers);
		if (answers.resetVantage) {
			nextConfig.vantage_token = null;
		}
		delete nextConfig.resetVantage;

		return config.set(nextConfig).then(() => {
			console.log(chalk.bold.green('Saved configuration!'));
		});
	});
};

export default {
	command: 'setup',
	describe: 'Set up configuration',
	handler,
} satisfies CommandDefinition;
