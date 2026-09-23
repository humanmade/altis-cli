// Helpers for recognising the informational options that must work before the
// configuration is loaded or setup is required. Kept as pure functions in their
// own module so they can be unit-tested without starting the CLI.
//
// --help and --version are global in yargs and take effect wherever they appear,
// so they count as informational anywhere in the arguments. The -h/-v short forms
// are only informational as the very first argument (a bare `altis-cli -h`/`-v`);
// after a subcommand they may mean something else — `stack scp -v` uses -v for
// verbose — so they are left untouched there.

const longOptions = new Set(['--help', '--version']);
const shortOptions = new Map([['-h', '--help'], ['-v', '--version']]);

export const isInformationalInvocation = args => {
	if (args.some(arg => longOptions.has(arg))) {
		return true;
	}
	return args.length > 0 && shortOptions.has(args[0]);
};

// Rewrite a leading -h/-v to its long form so yargs, which only registers
// --help/--version, handles it. Only the first argument is rewritten; later
// occurrences belong to subcommands.
export const toParserArgs = args => {
	if (args.length > 0 && shortOptions.has(args[0])) {
		return [shortOptions.get(args[0]), ...args.slice(1)];
	}
	return args;
};
