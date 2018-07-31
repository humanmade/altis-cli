module.exports = function ( command ) {
	command.demandCommand( 1 );

	command.command(
		'create <directory>',
		'Create a new project.',
		subcommand => {
			subcommand.positional( 'directory', {
				description: 'Directory to generate project into. Must be empty or not exist.'
			} );
		},
		require( './create' )
	);

	command.command(
		'generate-readme [directory]',
		'Generate a readme for the project.',
		subcommand => {
			subcommand.positional( 'directory', {
				default: () => process.cwd(),
				defaultDescription: 'Current directory',
			});
		},
		require( './generate-readme' )
	);
};
