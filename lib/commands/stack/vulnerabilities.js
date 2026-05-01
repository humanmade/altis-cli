import packagesCommand from './packages.js';

export default {
	...packagesCommand,
	command: 'vulnerabilities [stack]',
	description: 'Show packages with known vulnerabilities.',
	builder: yargs => packagesCommand.builder(yargs)
		.option('vulnerabilities', { type: 'boolean', default: true, hidden: true }),
	handler: argv => packagesCommand.handler({ ...argv, vulnerabilities: true }),
};
