import type { CliArguments, CommandDefinition } from '../../types/cli.ts';
import chalk from 'chalk';
import vantage from '../../vantage.ts';

const handler = (argv: CliArguments) => {
	const config = argv.config;
	if (!config.get('didSetup')) {
		console.log('No configuration detected. How did you even get here?');
		return;
	}
	const vantage_token = config.get('vantage_token');
	if (vantage_token) {
		const v = new vantage(config);
		v.fetch('/api/wp/v2/users/me')
			.then(resp => (resp.json() as Promise<{ slug: string }>))
			.then(data => {
				console.log(chalk.bold('Altis Cloud:'));
				console.log(`  ${chalk.bold('User')}: ${data.slug}`);
			});
	} else {
		console.log(`${chalk.bold('Altis Cloud')}: Not logged in.`);
	}
};

export default {
	command: 'status',
	describe: 'Show stored configuration',
	handler,
} satisfies CommandDefinition;
