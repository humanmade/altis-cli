import type { LogResponse } from '../../types/api.js';
import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.js';
import chalk from 'chalk';
import ora from 'ora';
import { format, parse } from 'url';
import Vantage from '../../vantage.js';

const handler = function (argv: CliArguments) {
	const { config, stack, before, after } = argv;
	const v = new Vantage(config);
	const status = ora(`Fetching PHP Logs for ${stack}`);
	status.start();
	if (argv.tail) {
		if (argv.before || argv.after) {
			status.fail('--before and --after are not supported with the --tail option.');
			return;
		}
		v.getLogStream({ id: stack!, log: `${stack}/php` }).then(stream => {
			stream.on('open', () => status.succeed(chalk.bold.yellow('Connected!')));
			stream.on('close', () => {
				status.fail(`Disconnected from ${stack}`);
			});
			stream.on('data', ({ type, data }) => {
				switch (type) {
					case 'log':
						const parsed = JSON.parse(data);
						console.log(parsed);
						break;
				}
			});
		});
	} else {
		const urlObj = parse(`stack/applications/${stack}/logs/php`, true);
		const args: Record<string, string> = {};
		if (argv.before) {
			args.before = argv.before;
		}
		if (argv.after) {
			args.after = argv.after;
		}
		urlObj.query = args;
		const url = format(urlObj);
		v.fetch(url).then(resp => {
			// hm-stack currently returns a 500 for invalid stacks, so we have to
			// assume any failure is a 404: https://github.com/humanmade/hm-stack/issues/367
			if (!resp.ok) {
				status.fail(`Invalid stack ${stack}`);
				throw new Error(`Invalid stack ${stack}`);
			}
			return (resp.json() as Promise<LogResponse[]>);
		}).then(logs => {
			status.succeed(chalk.bold.green('Complete!'));
			logs.map(log => console.log(log.message));
		}).catch(e => {
			status.fail(`Could not fetch details for ${stack}`);
			throw e;
		});
	}
};

export default {
	command: 'php-logs [stack]',
	describe: 'Show PHP logs for a stack.',
	builder: (subcommand: CommandBuilder) => {
		subcommand.option('before', {
			describe: 'Date to logs must be before.',
			type: 'string',
		});
		subcommand.option('after', {
			describe: 'Date to logs must be after.',
			type: 'string',
		});
		subcommand.option('tail', {
			describe: 'Live update log entries.',
			type: 'boolean',
		});
	},
	handler,
} satisfies CommandDefinition;
