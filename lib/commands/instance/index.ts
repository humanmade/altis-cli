import { errorCode } from '../../types/errors.ts';
import type { InstanceAccessRow, InstanceReport, InstanceResponse } from '../../types/api.ts';
import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.ts';
import chalk from 'chalk';
import { fetchJSON, confirm, printJSON, printTable } from '../stack/util.ts';
import Vantage from '../../vantage.ts';

function requireArg(value: unknown, message: string): asserts value {
	if (!value) {
		throw new Error(message);
	}
}

const handler = async (argv: CliArguments) => {
	const { group, action, id, value } = argv;
	const v = new Vantage(argv.config);

	if (!group || group === 'list') {
		const data = await fetchJSON<InstanceResponse[]>(v, 'stack/instances');
		if (argv.json) {
			printJSON(data);
			return;
		}
		printTable(data.map(instance => ({
			id: instance.id,
			name: instance.name || '',
		})));
		return;
	}

	if (group === 'info') {
		requireArg(action, 'Usage: altis-cli instance info <instance>');
		const data = await fetchJSON<InstanceResponse>(v, `stack/instances/${action}`);
		if (argv.json) {
			printJSON(data);
			return;
		}
		printJSON(data);
		return;
	}

	if (group === 'reports') {
		requireArg(action, 'Usage: altis-cli instance reports <instance>');
		const data = await fetchJSON<InstanceReport[]>(v, `stack/instances/${action}/reports`);
		if (argv.json) {
			printJSON(data);
			return;
		}
		printTable(data.map(report => ({
			year: report.year,
			month: String(report.month).padStart(2, '0'),
			response_time: report.topline?.response_time?.toFixed(3) ?? '',
			uptime: report.topline?.uptime != null ? (report.topline.uptime * 100).toFixed(2) + '%' : '',
			views: report.topline?.views ?? '',
			url: report.topline ? (report._links?.['https://hm-stack.hm/report']?.[0]?.href ?? '') : '',
		})));
		return;
	}

	if (group === 'maintenance') {
		requireArg(action, 'Usage: altis-cli instance maintenance <get|set> <instance>');
		requireArg(id, 'Instance id is required.');
		const url = `stack/instances/${id}/maintenance`;
		if (action === 'get') {
			const data = await fetchJSON<InstanceAccessRow[]>(v, url);
			if (argv.json) {
				printJSON(data);
				return;
			}
			printJSON(data);
			return;
		}
		if (action !== 'set') {
			throw new Error('Usage: altis-cli instance maintenance <get|set> <instance>');
		}
		const data = await fetchJSON<{ pending?: boolean }>(v, url, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ contact: argv.contact }),
		});
		if (argv.json) {
			printJSON(data);
			return;
		}
		console.log(chalk.green('Maintenance details updated.'));
		return;
	}

	if (group === 'access') {
		requireArg(action, 'Usage: altis-cli instance access <list|add|remove> <instance>');
		requireArg(id, 'Instance id is required.');
		const url = `stack/instances/${id}/access`;
		if (action === 'list') {
			const data = await fetchJSON<InstanceAccessRow[]>(v, url);
			if (argv.json) {
				printJSON(data);
				return;
			}
			printTable(data.map(row => ({
				id: typeof row.user === 'number' ? row.user : (row.id || (row.user && row.user.id) || ''),
				name: row.name || (typeof row.user === 'object' && row.user.name) || '',
				email: row.email || (typeof row.user === 'object' && row.user.email) || '',
				role: row.role,
				'2fa': row.has_2fa === undefined ? '' : row.has_2fa ? 'yes' : 'no',
				restricted: row.restricted === undefined ? '' : row.restricted ? 'yes' : 'no',
			})));
			return;
		}
		if (action === 'add') {
			requireArg(value, 'Email address is required.');
			let data;
			try {
				data = await fetchJSON<{ pending?: boolean }>(v, url, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ email: value, role: argv.role }),
				});
			} catch (err) {
				if (errorCode(err) === 'cannot-update-self') {
					throw new Error('You cannot modify your own instance access.');
				}
				throw err;
			}
			if (argv.json) {
				printJSON(data);
				return;
			}
			console.log(data.pending ? chalk.green(`Invitation sent to ${value}.`) : chalk.green('Access added.'));
			return;
		}
		if (action === 'remove') {
			requireArg(value, 'User ID is required.');
			if (!argv.yes && !await confirm(`Remove user ${value} from ${id}?`)) {
				console.log(chalk.yellow('Cancelled.'));
				return;
			}
			try {
				await fetchJSON<InstanceResponse>(v, `${url}/${encodeURIComponent(value)}`, { method: 'DELETE' });
			} catch (err) {
				if (errorCode(err) === 'cannot-update-self') {
					throw new Error('You cannot remove your own instance access.');
				}
				throw err;
			}
			console.log(chalk.green('Access removed.'));
			return;
		}
	}

	throw new Error('Unknown instance command.');
};

export default {
	command: 'instance [group] [action] [id] [value]',
	describe: 'Instance commands',
	builder: (yargs: CommandBuilder) => yargs
		.option('role', { choices: ['user', 'developer'], default: 'user', describe: 'Access role.' })
		.option('contact', { type: 'string', describe: 'Maintenance contact.' })
		.option('yes', { type: 'boolean', describe: 'Skip confirmation.' })
		.option('json', { type: 'boolean', describe: 'Print JSON output.' }),
	handler,
} satisfies CommandDefinition;
