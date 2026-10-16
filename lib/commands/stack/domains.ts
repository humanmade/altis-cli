import type { Domain } from '../../types/api.ts';
import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.ts';
import chalk from 'chalk';
import { getApp, confirm, printJSON, printTable } from './util.ts';
import Vantage from '../../vantage.ts';

const handler = async (argv: CliArguments) => {
	const action = argv.action || 'list';
	if (!['list', 'add', 'remove', 'retry'].includes(action)) {
		throw new Error('Usage: altis-cli app domains <list|add|remove|retry> [app] [domain...]');
	}
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const base = `stack/applications/${app}/domains` as const;

	if (action === 'list') {
		const data = await v.request(base);
		if (argv.json) {
			printJSON(data);
			return;
		}
		printTable(data.map(item => ({
			name: item.name || item.domain || item,
			status: item.status || '',
			origin: item.origin || '',
			certificate: item.certificate_status || item.certificateStatus || '',
			reason: item.certificate_failure_reason || '',
		})));
		return;
	}

	const domains = typeof argv.domain === 'string' ? [argv.domain] : argv.domain || [];
	if (domains.length === 0) {
		throw new Error('At least one domain is required.');
	}

	if (action === 'add') {
		const data = await v.request(base, {
			method: 'POST',
			body: { domains, origin: argv.origin },
		});
		if (argv.json) {
			printJSON(data);
			return;
		}
		console.log(chalk.green(`Added ${domains.length} domain(s).`));
		return;
	}

	const domain = domains[0];
	if (action === 'remove') {
		if (!argv.yes && !await confirm(`Remove ${domain} from ${app}?`)) {
			console.log(chalk.yellow('Cancelled.'));
			return;
		}
		await v.request(`${base}/${encodeURIComponent(domain)}` as const, { method: 'DELETE' });
		console.log(chalk.green('Domain removed.'));
		return;
	}

	await v.request(`${base}/${encodeURIComponent(domain)}/retry-failed-domain` as const, { method: 'POST' });
	console.log(chalk.green('Domain retry requested.'));
};

export default {
	command: 'domains <action> [stack] [domain..]',
	describe: 'Manage application domains.',
	builder: (yargs: CommandBuilder) => yargs
		.option('origin', { type: 'string', describe: 'Origin service.' })
		.option('yes', { type: 'boolean', describe: 'Skip confirmation.' })
		.option('json', { type: 'boolean', describe: 'Print JSON output.' }),
	handler,
} satisfies CommandDefinition;
