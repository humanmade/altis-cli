import fs from 'node:fs';
import path from 'node:path';
import inquirer from 'inquirer';
import type { CliArguments } from './types/cli.ts';

export interface ProjectContext {
	root: string;
	instance?: string;
	environments: Record<string, string>;
}
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Find the nearest Composer project, without executing its configuration. */
export function readProjectContext(cwd = process.cwd()): ProjectContext | undefined {
	let directory = path.resolve(cwd);
	for (;;) {
		const file = path.join(directory, 'composer.json');
		if (fs.existsSync(file)) {
			let composer: unknown;
			try { composer = JSON.parse(fs.readFileSync(file, 'utf8')); }
			catch { throw new Error(`Cannot read project context: invalid JSON in ${file}.`); }
			if (!isObject(composer) || !isObject(composer.extra) || !isObject(composer.extra.altis) || composer.extra.altis.cli === undefined) return undefined;
			const context = composer.extra.altis.cli;
			if (!isObject(context)) throw new Error(`extra.altis.cli must be an object in ${file}.`);
			if (context.instance !== undefined && (typeof context.instance !== 'string' || !context.instance.trim())) throw new Error(`extra.altis.cli.instance must be a non-empty string in ${file}.`);
			const environments = context.environments ?? {};
			if (!isObject(environments) || Object.entries(environments).some(([name, app]) => !name.trim() || typeof app !== 'string' || !app.trim())) throw new Error(`extra.altis.cli.environments must map environment names to application IDs in ${file}.`);
			return { root: fs.realpathSync(directory), instance: context.instance as string | undefined, environments: environments as Record<string, string> };
		}
		const parent = path.dirname(directory);
		if (parent === directory) return undefined;
		directory = parent;
	}
}

type ContextArguments = Pick<CliArguments, 'app' | 'stack' | 'env'> & Partial<Pick<CliArguments, 'config'>>;

export async function resolveProjectApp(argv: ContextArguments, cwd = process.cwd()): Promise<string | undefined> {
	if (argv.stack || argv.app) return argv.stack || argv.app;
	const project = readProjectContext(cwd);
	const environments = project?.environments ?? {};
	const names = Object.keys(environments);
	if (argv.env !== undefined) {
		if (!names.length) throw new Error('--env requires extra.altis.cli.environments in the nearest composer.json.');
		if (!Object.hasOwn(environments, argv.env)) throw new Error(`Unknown environment "${argv.env}". Available environments: ${names.join(', ')}.`);
		return environments[argv.env];
	}
	if (!project || !names.length) return undefined;
	if (names.length === 1) return environments[names[0]];
	if (!process.stdin.isTTY) throw new Error(`Select a project environment with --env (${names.join(', ')}), or pass an explicit application ID.`);
	const { environment } = await inquirer.prompt<{ environment: string | null }>({
		type: 'list', name: 'environment', message: 'Select project environment:',
		choices: [
			...names.map(name => ({ name: `${name} (${environments[name]})`, value: name })),
			{ name: 'Show all apps', value: null },
		],
	});
	return environment === null ? undefined : environments[environment];
}
