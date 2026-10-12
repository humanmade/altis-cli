import type { CommandDefinition } from '../../types/cli.js';
import stackCommand from '../stack/index.js';

export default {
	...stackCommand,
	command: 'app',
	describe: 'Application commands',
} satisfies CommandDefinition;
