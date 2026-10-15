import { parseBoolean } from '../../../boolean.ts';
import type { CliArguments, CommandDefinition } from '../../../types/cli.ts';
import type { Deployment } from '../../../types/rest-api.ts';
import Vantage from '../../../vantage.ts';
import { fetchJSON, getApp, printJSON, printTable } from '../util.ts';

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
					.positional('value', { type: 'string', describe: 'Branch name, or true/false, 1/0, yes/no, or on/off for autodeploy.' }),
				handler: async argv => {
					const value = argv.value!.trim();
					if (argv.name === 'branch' && !value) throw new Error('Branch must be a non-empty name.');
					const body: Partial<DeploymentSettings> = argv.name === 'branch'
						? { ref: value }
						: { is_autoupdating: parseBoolean(value) };
					const app = await getApp(argv);
					await fetchJSON<DeploymentSettings>(new Vantage(argv.config), `stack/applications/${encodeURIComponent(app)}/deployment`, {
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
