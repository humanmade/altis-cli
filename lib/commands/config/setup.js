const chalk = require( 'chalk' );
const inquirer = require( 'inquirer' );
const { REGIONS } = require( '../../vantage' );

module.exports = function ( argv ) {
	const { config } = argv;
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
	return inquirer.prompt( questions ).then( answers => {
		const nextConfig = Object.assign( {}, answers, {
			didSetup: true,
		});
		return config.set( nextConfig ).then(() => {
			console.log( chalk.bold.green( 'Saved configuration!' ) );
		});
		// console.log( answers );
	});
};
