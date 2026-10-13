import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.ts';
import packagesCommand from './packages.ts';

export default {
	...packagesCommand,
	command: 'vulnerabilities [stack]',
	describe: 'Show packages with known vulnerabilities.',
	builder: (yargs: CommandBuilder) => packagesCommand.builder(yargs)
		.option('vulnerabilities', { type: 'boolean', default: true, hidden: true }),
	handler: (argv: CliArguments) => packagesCommand.handler({ ...argv, vulnerabilities: true }),
} satisfies CommandDefinition;
