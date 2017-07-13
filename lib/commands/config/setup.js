const chalk = require( 'chalk' );
const inquirer = require( 'inquirer' );
const { REGIONS } = require( '../../vantage' );

module.exports = function ( argv ) {
	const { config } = argv;
	const github = config.get( 'github' );
	const ssh = config.get( 'ssh' );

	const questions = [
		{
			type: "input",
			name: "ssh.user",
			message: "SSH/Proxy Username",
			default: ssh ? ssh.user : process.env.USER,
		},
		{
			type: "list",
			name: "ssh.proxyRegion",
			message: "Proxy Region (pick closest geographically)",
			default: ssh ? ssh.proxyRegion : 'auto',
			choices: [
				{
					name: 'Autodetect',
					value: 'auto',
				},
				new inquirer.Separator(),
				...REGIONS
			],
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
	return inquirer.prompt( questions ).then( answers => {
		const nextConfig = Object.assign( {}, answers );
		if ( answers.resetGitHub ) {
			nextConfig.github = {};
		}
		delete nextConfig.resetGitHub;

		return config.set( nextConfig ).then(() => {
			console.log( chalk.bold.green( 'Saved configuration!' ) );
		});
		// console.log( answers );
	});
};
