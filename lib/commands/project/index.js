module.exports = function ( command ) {
	command.demandCommand( 1 );

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
