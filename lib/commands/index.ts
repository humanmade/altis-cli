import { fileURLToPath } from 'node:url';

import type { CommandBuilder } from '../types/cli.ts';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import buildSubcommands from '../buildSubcommands.ts';

export default async () => {
    // Use yargs/yargs and hideBin for ESM compatibility
    const globalCommand = yargs(hideBin(process.argv)).version().help().option('env', { type: 'string', requiresArg: true, describe: 'Environment from composer.json extra.altis.cli.environments.', global: true });

    const subcommands = await buildSubcommands(fileURLToPath(new URL('.', import.meta.url)));
    (globalCommand as unknown as CommandBuilder).command(subcommands);

    // Require at least one subcommand.
    globalCommand.demandCommand(1);
    globalCommand.strict();

    return globalCommand;
};

