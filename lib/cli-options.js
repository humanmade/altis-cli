// Helpers for informational options that work before the
// configuration is loaded.
//
// The -h/-v short forms are only informational as the very first argument (a bare `altis-cli -h`/`-v`);
// so they don't break any subcommand that uses a different meaning. e.g. `stack scp -v`

const longOptions = new Set(['--help', '--version']);
const shortOptions = new Map([['-h', '--help'], ['-v', '--version']]);

export const isInformationalInvocation = args => {
	if (args.some(arg => longOptions.has(arg))) {
		return true;
	}
	return args.length > 0 && shortOptions.has(args[0]);
};

// Rewrite -h/-v to their long form so yargs, which only registers
// --help/--version, handles it. Only the first argument is rewritten; later
// occurrences belong to subcommands.
export const toParserArgs = args => {
	if (args.length > 0 && shortOptions.has(args[0])) {
		return [shortOptions.get(args[0]), ...args.slice(1)];
	}
	return args;
};
