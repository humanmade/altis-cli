import chalk from 'chalk';
import inquirer from 'inquirer';

const handler = function (argv) {
	const { config } = argv;
	const vantage = config.get('vantage_token');

	const questions = [];
	if (vantage) {
		questions.push({
			type: "confirm",
			name: "resetVantage",
			message: `Logged in to Vantage. Reset?`,
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
	description: 'Set up configuration',
	handler,
};
