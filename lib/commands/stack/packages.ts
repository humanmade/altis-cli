import { errorStatus } from '../../types/errors.js';
import type { Package } from '../../types/api.js';
import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.js';
import { getApp, fetchJSON, printJSON, printTable } from './util.js';
import Vantage from '../../vantage.js';

const handler = async (argv: CliArguments) => {
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const suffix = argv.build ? `/${argv.build}` : '';
	let packages;
	try {
		packages = await fetchJSON<Package[]>(v, `stack/applications/${app}/packages${suffix}`);
	} catch (err) {
		if (errorStatus(err) === 404) {
			throw new Error('No active build found for this application.');
		}
		throw err;
	}
	const rows = argv.vulnerabilities ? packages.filter(pkg => (pkg.vulnerabilities || []).length > 0) : packages;
	if (argv.json) {
		printJSON(rows);
		return;
	}
	printTable(rows.map(pkg => ({
		type: pkg.type,
		name: pkg.name,
		version: pkg.version,
		latest: pkg.latest || pkg.latest_version || '',
		vulnerabilities: (pkg.vulnerabilities || []).length,
	})));
};

export default {
	command: 'packages [stack]',
	describe: 'List packages for an application.',
	builder: (yargs: CommandBuilder) => yargs
		.option('build', { type: 'string', describe: 'Build ID.' })
		.option('vulnerabilities', { type: 'boolean', describe: 'Only show packages with vulnerabilities.' })
		.option('json', { type: 'boolean', describe: 'Print JSON output.' }),
	handler,
} satisfies CommandDefinition;
