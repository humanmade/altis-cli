
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import buildSubcommands from '../buildSubcommands.js';

export default async () => {
    // Use yargs/yargs and hideBin for ESM compatibility
    const globalCommand = yargs(hideBin(process.argv)).version().help();

    const subcommands = await buildSubcommands(new URL('.', import.meta.url).pathname);
    globalCommand.command(subcommands);

    // Require at least one subcommand.
    globalCommand.demandCommand(1);
    globalCommand.strict();

    return globalCommand;
};

