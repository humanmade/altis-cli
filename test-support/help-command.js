import configure from '../dist/lib/commands/index.js';

const parser = await configure();
parser.exitProcess(false);
parser.fail((message, error) => {
	throw error || new Error(message);
});

try {
	await parser.parseAsync(process.argv.slice(2), { config: {} });
} catch (error) {
	process.stderr.write(`${error.message}\n`);
	process.exitCode = 1;
}
