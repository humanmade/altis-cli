const ora = require( 'ora' );

module.exports = argv => {
	const { config } = argv;

	const status = ora( 'Clearing cache…' ).start();
	config.cache.reset().then( () => {
		status.succeed( 'Cleared cache' );
	} );
};
