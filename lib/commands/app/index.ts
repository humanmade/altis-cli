import type { CommandDefinition } from '../../types/cli.ts';
import stackCommand from '../stack/index.ts';

export default {
	...stackCommand,
	command: 'app',
	describe: 'Application commands',
} satisfies CommandDefinition;
