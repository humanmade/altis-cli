import type { CommandDefinition } from '../../../types/cli.ts';
import { databaseOptions, runDatabase } from '../../../database.ts';

export default {
	command: 'cli [stack]',
	describe: 'Open the mysql command-line client through a database tunnel.',
	builder: databaseOptions,
	handler: argv => runDatabase(argv, 'cli'),
} satisfies CommandDefinition;
