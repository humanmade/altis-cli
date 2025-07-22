import ora from 'ora';

export default {
	command: 'clear-cache',
	description: 'Clear the cache file',
	handler: argv => {
		const { config } = argv;
		const status = ora('Clearing cache…').start();
		config.cache.reset().then(() => {
			status.succeed('Cleared cache');
		});
	},
};
