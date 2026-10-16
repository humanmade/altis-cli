import type { Backup } from '../../types/api.ts';
import type { CliArguments, CommandBuilder, CommandDefinition } from '../../types/cli.ts';

import bytes from 'bytes';
import chalk from 'chalk';
import clipboardy from 'clipboardy';
import fs from 'fs';
import inquirer from 'inquirer';
import fetch from 'node-fetch';
import logUpdate from 'log-update';
import ora from 'ora';
import path from 'path';
import { homedir } from 'node:os';
import progressStream from 'progress-stream';
import unusedFilename from 'unused-filename';

import Vantage from '../../vantage.ts';
import { getStack, streamLog } from './util.ts';

const getProgress = (progress: import('progress-stream').Progress) => {
	const { percentage, speed } = progress;
	let bar = Array( Math.floor( 45 * percentage / 100 ) ).join( '=' ) + '>'
	while ( bar.length < 45 ) {
		bar += ' ';
	}

	return `[${ bar }] ${ percentage.toFixed( 1 ) }% (${ bytes( speed ) }/s)`;
};

const handler = (argv: CliArguments) => {
	getStack( argv ).then( (stack: string) => {
		const v = new Vantage( argv.config );

		const status = ora( `Loading backups for ${ stack }…` );
		status.start();

		v.request( `stack/applications/${ stack }/backups` )
			.then( backups => {
				status.succeed();

				const latest = backups.slice();
				latest.sort( ( a, b ) => {
					const aTime = new Date(a.date).getTime();
					const bTime = new Date(b.date).getTime();

					return bTime - aTime;
				} );

				const rows = latest.map( row => {
					return {
						name: `${ row.id } ${ chalk.grey( `(${ bytes( row.size ) })` ) }`,
						value: row,
						short: row.id,
					};
				} );

				return inquirer.prompt({
					type: 'list',
					name: 'backup',
					message: 'Select backup to download:',
					choices: rows,
				});
			} )
			.then( choices => choices.backup )
			.then( row => {
				const downloadPath = path.join( homedir(), 'Downloads', row.id );
				return unusedFilename( downloadPath ).then( path => {
					return Object.assign( {}, row, { path: path } );
				} );
			} )
			.then( row => {
				const output = fs.createWriteStream( row.path );
				console.log( chalk.yellow( `Downloading to ${ chalk.underline( row.path ) }` ) );
				const status = ora( `Downloading…` );
				status.start();
				const progress = progressStream( {
					length: row.size,
				} );
				progress.on( 'progress', (progress: import('progress-stream').Progress) => {
					status.text = getProgress( progress );
				} );

				fetch( row.url )
					.then( resp => {
						resp.body!
							.pipe( progress )
							.pipe( output )
							.on( 'close', () => {
								clipboardy.writeSync( row.path );
								status.succeed( `${ chalk.bold( 'Downloaded.' ) } Copied ${ chalk.bold( row.path ) } to clipboard.` );
							} );
					} );
			});
	} );
};

export default {
	command: 'backups [stack]',
	describe: 'List backups for the stack.',
	handler,
} satisfies CommandDefinition;
