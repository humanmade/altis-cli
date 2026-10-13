import { tailStream } from '../../log-tail.ts';
import type { LogResponse } from '../../types/api.ts';
import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.ts';
import chalk from 'chalk';
import ora from 'ora';
import { stringify } from 'querystring';
import Vantage from '../../vantage.ts';

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
		return tailStream(() => v.getLogStream({ id: stack!, log: `${stack}/php` }), stream => {
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
		}, () => status.stop());
	} else {
		const args: Record<string, string> = {};
		if (argv.before) {
			args.before = argv.before;
		}
		if (argv.after) {
			args.after = argv.after;
		}
		const query = stringify(args);
		const url = `stack/applications/${stack}/logs/php${query ? `?${query}` : ''}`;
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
