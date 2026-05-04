import chalk from 'chalk';
import { getApp, fetchJSON, confirm, printJSON, printTable } from './util.js';
import Vantage from '../../vantage.js';

const handler = async argv => {
	const action = argv.action || 'list';
	if (!['list', 'add', 'remove', 'retry'].includes(action)) {
		throw new Error('Usage: altis-cli app domains <list|add|remove|retry> [app] [domain...]');
	}
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const base = `stack/applications/${app}/domains`;

	if (action === 'list') {
		const data = await fetchJSON(v, base);
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

	const domains = argv.domain || [];
	if (domains.length === 0) {
		throw new Error('At least one domain is required.');
	}

	if (action === 'add') {
		const data = await fetchJSON(v, base, {
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
		await fetchJSON(v, `${base}/${encodeURIComponent(domain)}`, { method: 'DELETE' });
		console.log(chalk.green('Domain removed.'));
		return;
	}

	await fetchJSON(v, `${base}/${encodeURIComponent(domain)}/retry-failed-domain`, { method: 'POST' });
	console.log(chalk.green('Domain retry requested.'));
};

export default {
	command: 'domains <action> [stack] [domain..]',
	description: 'Manage application domains.',
	builder: yargs => yargs
		.option('origin', { type: 'string', description: 'Origin service.' })
		.option('yes', { type: 'boolean', description: 'Skip confirmation.' })
		.option('json', { type: 'boolean', description: 'Print JSON output.' }),
	handler,
};
