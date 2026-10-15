import type { CommandDefinition } from '../../../types/cli.ts';
import { databaseOptions, runDatabase } from '../../../database.ts';

export default {
	command: 'sequel [stack]',
	describe: 'Open Sequel Ace or Sequel Pro through a database tunnel (macOS).',
	builder: databaseOptions,
	handler: argv => runDatabase(argv, 'sequel'),
} satisfies CommandDefinition;
