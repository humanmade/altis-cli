const inquirer = require( 'inquirer' );

module.exports = argv => {
	inquirer.prompt( {
		type: 'confirm',
		name: 'sure',
		message: 'Are you sure you want to reset your configuration?',
		default: false,
	} ).then( ({ sure }) => {
		if ( ! sure ) {
			return;
		}

		return argv.config.reset().then( () => {
			console.log( 'Configuration reset.' )
		});
	})
};
