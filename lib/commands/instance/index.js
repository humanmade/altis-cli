import chalk from 'chalk';
import { fetchJSON, confirm, printJSON, printTable } from '../stack/util.js';
import Vantage from '../../vantage.js';

function requireArg(value, message) {
	if (!value) {
		throw new Error(message);
	}
}

const handler = async argv => {
	const { group, action, id, value } = argv;
	const v = new Vantage(argv.config);

	if (!group || group === 'list') {
		const data = await fetchJSON(v, 'stack/instances');
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
		const data = await fetchJSON(v, `stack/instances/${action}`);
		if (argv.json) {
			printJSON(data);
			return;
		}
		printJSON(data);
		return;
	}

	if (group === 'reports') {
		requireArg(action, 'Usage: altis-cli instance reports <instance>');
		const data = await fetchJSON(v, `stack/instances/${action}/reports`);
		if (argv.json) {
			printJSON(data);
			return;
		}
		printTable(data);
		return;
	}

	if (group === 'maintenance') {
		requireArg(action, 'Usage: altis-cli instance maintenance <get|set> <instance>');
		requireArg(id, 'Instance id is required.');
		const url = `stack/instances/${id}/maintenance`;
		if (action === 'get') {
			const data = await fetchJSON(v, url);
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
		const data = await fetchJSON(v, url, {
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
			const data = await fetchJSON(v, url);
			if (argv.json) {
				printJSON(data);
				return;
			}
			printTable(data.map(row => ({
				id: typeof row.user === 'number' ? row.user : (row.id || (row.user && row.user.id) || ''),
				name: row.name || (row.user && row.user.name) || '',
				email: row.email || (row.user && row.user.email) || '',
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
				data = await fetchJSON(v, url, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ email: value, role: argv.role }),
				});
			} catch (err) {
				if (err.code === 'cannot-update-self') {
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
				await fetchJSON(v, `${url}/${encodeURIComponent(value)}`, { method: 'DELETE' });
			} catch (err) {
				if (err.code === 'cannot-update-self') {
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
	description: 'Instance commands',
	builder: yargs => yargs
		.option('role', { choices: ['user', 'developer'], default: 'user', description: 'Access role.' })
		.option('contact', { type: 'string', description: 'Maintenance contact.' })
		.option('yes', { type: 'boolean', description: 'Skip confirmation.' })
		.option('json', { type: 'boolean', description: 'Print JSON output.' }),
	handler,
};
