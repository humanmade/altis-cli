import type { ApplicationResponse } from '../../types/api.ts';
import type { CliArguments, CommandDefinition } from '../../types/cli.ts';
import bytes from 'bytes';
import chalk from 'chalk';
import fs from 'fs';
import ora from 'ora';
import process from 'process';
import cmd from 'node-cmd';

import Vantage from '../../vantage.ts';
import { getStack, streamLog } from './util.ts';

const handler = (argv: CliArguments) => {
	getStack(argv).then((stack: string) => {
		const v = new Vantage(argv.config);
		const status = ora(`Loading repository for ${stack}…`);
		status.start();
		v.fetch(`stack/applications/${stack}`)
			.then(resp => (resp.json() as Promise<ApplicationResponse>))
			.then((repo: ApplicationResponse) => {
				status.succeed();
				const url = repo['git-deployment']['url'];
				const branch = repo['git-deployment']['ref'];
				const dir = `./${stack}`;
				if (!fs.existsSync(dir)) {
					console.log(chalk.yellow(`Creating directory: ${chalk.underline(dir)}`));
					fs.mkdirSync(dir);
				}
				process.chdir(dir);
				console.log(chalk.yellow(`Cloning: ${chalk.underline(url)}`));
				cmd.runSync(`git clone --branch ${branch} ${url} ./`);
				console.log(chalk.yellow(`Installing dependencies…`));
				cmd.runSync('composer install');
				console.log(chalk.yellow(`${chalk.underline(stack)} is now available at ${chalk.underline(dir)}`));
				console.log(chalk.yellow('Run `composer server start` to get started'));
			});
	});
};

export default {
	command: 'local-setup [stack]',
	describe: 'Setup an existing Altis stack locally.',
	handler,
} satisfies CommandDefinition;
