module.exports = yargs => {
	yargs.command(
		'cli',
		'Meta CLI commands',
		require( './cli' )
	);

	yargs.command(
		'completion',
		'Shell autocompletion',
		command => {
			command.showCompletionScript();
		}
	);

	yargs.command(
		'config',
		'Configuration commands',
		require( './config' )
	);

	yargs.command(
		'stack',
		'Stack commands',
		require( './stack' )
	);
};
