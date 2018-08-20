const run = function ( argv ) {
	//
	// Do we have phpcs installed locally?
	// exists( path.join( directory, 'vendor/bin/phpcs' ) )
};

module.exports = function ( command ) {
	// Main configuration.
	command.demandCommand( 1 );

	// "add" subcommand.
	command.command(
		'add [directory]',
		'Add CS to existing repo.',
		subcommand => {
			subcommand.option( 'directory', {
				default: () => process.cwd(),
				defaultDescription: 'Current directory',
			});
			subcommand.option( 'force', {
				alias: 'f',
				default: false,
				description: 'Write files without asking for confirmation',
				type: 'boolean',
			});
		},
		add
	);

	command.command(
		'run',
		'Run coding standards on the current repo.',
		subcommand => {},
		require( './add' )
	);
};
