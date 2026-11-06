import { parseBoolean } from '../../../boolean.ts';
import type { CliArguments, CommandDefinition } from '../../../types/cli.ts';
import type { ApplicationResponse, Deployment } from '../../../types/rest-api.ts';
import chalk from 'chalk';
import Vantage from '../../../vantage.ts';
import { confirm, fetchJSON, getApp, printJSON, printTable } from '../util.ts';

type DeploymentSettings = Pick<Deployment, 'is_autoupdating' | 'ref'>;
const settingNames = ['autodeploy', 'branch'] as const;
type SettingName = typeof settingNames[number];

async function readSettings(argv: CliArguments) {
	const app = await getApp(argv);
	const deployment = await fetchJSON<DeploymentSettings>(new Vantage(argv.config), `stack/applications/${encodeURIComponent(app)}/deployment`);
	return { autodeploy: deployment.is_autoupdating, branch: deployment.ref };
}

export default {
	command: 'settings',
	describe: 'Read and update deployment settings.',
	builder: parser => {
		parser.demandCommand(1).command([
			{
				command: 'list [stack]',
				describe: 'Show supported deployment settings.',
				builder: command => command.option('json', { type: 'boolean', describe: 'Output JSON.' }),
				handler: async argv => {
					const settings = await readSettings(argv);
					if (argv.json) printJSON(settings);
					else printTable(Object.entries(settings).map(([setting, value]) => ({ setting, value })));
				},
			},
			{
				command: 'get <name> [stack]',
				describe: 'Get a deployment setting.',
				builder: command => command.positional('name', { type: 'string', choices: settingNames }),
				handler: async argv => console.log((await readSettings(argv))[argv.name as SettingName]),
			},
			{
				command: 'update <name> <value> [stack]',
				describe: 'Update supplied deployment settings.',
				builder: command => command
					.positional('name', { type: 'string', choices: settingNames })
					.positional('value', { type: 'string', describe: 'Branch name, or true/false, 1/0, yes/no, or on/off for autodeploy.' })
					.option('yes', { type: 'boolean', describe: 'Skip confirmation when enabling autodeploy on production.' }),
				handler: async argv => {
					const value = argv.value!.trim();
					// Treat quote-only values such as '' (from over-quoting in the shell) as empty.
					if (argv.name === 'branch' && !value.replace(/['"\s]/g, '')) throw new Error('Branch must be a non-empty name.');
					const body: Partial<DeploymentSettings> = argv.name === 'branch'
						? { ref: value }
						: { is_autoupdating: parseBoolean(value) };
					const app = await getApp(argv);
					const vantage = new Vantage(argv.config);
					// The Dashboard blocks enabling autodeploy on production, so ask before doing it here.
					if (body.is_autoupdating && !argv.yes) {
						const application = await fetchJSON<Pick<ApplicationResponse, 'environment-type'>>(vantage, `stack/applications/${encodeURIComponent(app)}`);
						if (application['environment-type'] === 'production' && !await confirm(`${app} is a production environment. Enable autodeploy anyway?`)) {
							console.log(chalk.yellow('Cancelled.'));
							return;
						}
					}
					await fetchJSON<DeploymentSettings>(vantage, `stack/applications/${encodeURIComponent(app)}/deployment`, {
						method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
					});
					console.log(argv.name === 'branch'
						? `Deployment branch set to ${value} for ${app}.`
						: `Autodeploy ${body.is_autoupdating ? 'enabled' : 'disabled'} for ${app}.`);
				},
			},
		]);
	},
} satisfies CommandDefinition;
