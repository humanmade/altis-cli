import { getApp, fetchJSON, printJSON, printTable } from './util.js';
import Vantage from '../../vantage.js';

const handler = async argv => {
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const suffix = argv.build ? `/${argv.build}` : '';
	let packages;
	try {
		packages = await fetchJSON(v, `stack/applications/${app}/packages${suffix}`);
	} catch (err) {
		if (err.status === 404) {
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
	description: 'List packages for an application.',
	builder: yargs => yargs
		.option('build', { type: 'string', description: 'Build ID.' })
		.option('vulnerabilities', { type: 'boolean', description: 'Only show packages with vulnerabilities.' })
		.option('json', { type: 'boolean', description: 'Print JSON output.' }),
	handler,
};
