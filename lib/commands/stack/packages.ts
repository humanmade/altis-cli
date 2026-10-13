import { errorStatus } from '../../types/errors.ts';
import type { Package } from '../../types/api.ts';
import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.ts';
import { getApp, printJSON, printTable } from './util.ts';
import Vantage from '../../vantage.ts';

const handler = async (argv: CliArguments) => {
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const suffix = argv.build ? `/${argv.build}` : '';
	let packages;
	try {
		const url = argv.build ? `stack/applications/${app}/packages/${argv.build}` as const : `stack/applications/${app}/packages` as const;
		packages = await v.request(url);
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
