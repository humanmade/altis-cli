import type { ApplicationResponse } from '../../types/api.ts';
import type { CliArguments, CommandDefinition } from '../../types/cli.ts';

import chalk from 'chalk';
import columnify from 'columnify';
import ora from 'ora';
import { renderCommit, renderRepo } from './util.ts';
import Vantage from '../../vantage.ts';

const handler = function ( argv: CliArguments ) {
	const { config } = argv;

	const v = new Vantage( config );
	const vPromise = v.request( 'stack/applications' );

	const status = ora( 'Fetching applications…' );
	status.start();
	vPromise.then( data => {
		status.stop();

		const tableConfig = {
			columnSplitter: chalk.grey( ' | ' ),
			config: {
				issue: {
					minWidth: 5,
				},
				title: {
					truncate: true,
					maxWidth: 80,
				},
				commit: {
					truncate: true,
					maxWidth: 35
				},
			},
			headingTransform: (name: string) => chalk.blue( name.toUpperCase() ),
		};

		const values = data.map(item => ({
			stack: item.id,
			repo: item['git-deployment'].url ? renderRepo( item['git-deployment'].url ) : '',
			branch: item['git-deployment'].ref,
			commit: item['git-deployment'].branch_details ? renderCommit( item['git-deployment'].branch_details.latest_commit ) : '',
			version: item.version,
		}));
		console.log( columnify( values, tableConfig ) );
	})
	.catch( e => {
		status.stop();
		throw e;
	});
};
export default {
	command: 'list',
	describe: 'List stacks available in our hosting.',
	handler,
} satisfies CommandDefinition;
