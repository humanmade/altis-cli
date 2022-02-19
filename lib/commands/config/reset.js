const inquirer = require( 'inquirer' );

const handler = argv => {
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

module.exports = {
    command: 'reset',
    description: 'Reset configuration',
    handler,
};
