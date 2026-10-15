import type { CommandDefinition } from '../../../types/cli.ts';
import { databaseOptions, runDatabase } from '../../../database.ts';

export default {
	command: 'tunnel [stack]',
	describe: 'Forward a local port to the application’s primary database.',
	builder: databaseOptions,
	handler: argv => runDatabase(argv, 'tunnel'),
} satisfies CommandDefinition;
