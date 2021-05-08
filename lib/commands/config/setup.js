const chalk = require( 'chalk' );
const inquirer = require( 'inquirer' );

module.exports = function ( argv ) {
	const { config } = argv;
	const github = config.get( 'github' );
	const ssh = config.get( 'ssh' );
	const vantage = config.get( 'vantage_token' );

	const questions = [
		{
			type: "input",
			name: "ssh.user",
			message: "SSH/Proxy Username",
			default: ssh ? ssh.user : process.env.USER,
		}
	];
	if ( github && github.user ) {
		questions.push({
			type: "confirm",
			name: "resetGitHub",
			message: `Logged in as ${github.user} on GitHub. Reset?`,
			default: false,
		});
	}
	if ( vantage ) {
		questions.push( {
			type: "confirm",
			name: "resetVantage",
			message: `Logged in to Vantage. Reset?`,
			default: false,
		} );
	}
	return inquirer.prompt( questions ).then( answers => {
		const nextConfig = Object.assign( {}, answers );
		if ( answers.resetGitHub ) {
			nextConfig.github = {};
		}
		if ( answers.resetVantage ) {
			nextConfig.vantage_token = null;
		}
		delete nextConfig.resetGitHub;
		delete nextConfig.resetVantage;

		return config.set( nextConfig ).then(() => {
			console.log( chalk.bold.green( 'Saved configuration!' ) );
		});
		// console.log( answers );
	});
};
