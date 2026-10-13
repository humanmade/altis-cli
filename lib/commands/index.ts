import { fileURLToPath } from 'node:url';

import type { CommandBuilder } from '../types/cli.ts';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import buildSubcommands from '../buildSubcommands.ts';

export default async () => {
    // Use yargs/yargs and hideBin for ESM compatibility
    const globalCommand = yargs(hideBin(process.argv)).version().help();

    const subcommands = await buildSubcommands(fileURLToPath(new URL('.', import.meta.url)));
    (globalCommand as unknown as CommandBuilder).command(subcommands);

    // Require at least one subcommand.
    globalCommand.demandCommand(1);
    globalCommand.strict();

    return globalCommand;
};

