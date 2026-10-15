import type { Domain } from '../../types/api.ts';
import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.ts';
import chalk from 'chalk';
import { getApp, fetchJSON, confirm, printJSON, printTable } from './util.ts';
import Vantage from '../../vantage.ts';

const handler = async (argv: CliArguments) => {
	const action = argv.action || 'list';
	if (!['list', 'add', 'remove', 'retry'].includes(action)) {
		throw new Error('Usage: altis-cli app domains <list|add|remove|retry> [app] [domain...]');
	}
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const base = `stack/applications/${app}/domains`;

	if (action === 'list') {
		const data = await fetchJSON<Domain[]>(v, base);
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
		const data = await fetchJSON<Domain[]>(v, base, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ domains, origin: argv.origin }),
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
		await fetchJSON<Domain[]>(v, `${base}/${encodeURIComponent(domain)}`, { method: 'DELETE' });
		console.log(chalk.green('Domain removed.'));
		return;
	}

	await fetchJSON<Domain[]>(v, `${base}/${encodeURIComponent(domain)}/retry-failed-domain`, { method: 'POST' });
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
