const yargs = require( 'yargs' );

const buildSubcommands = require( '../buildSubcommands' );

module.exports = () => {
    // Global options.
    const globalCommand = yargs.version().help();

    globalCommand.command( buildSubcommands( __dirname ) );

    // Require at least one subcommand.
    globalCommand.demandCommand( 1 );
    globalCommand.strict();

    return globalCommand;
};
