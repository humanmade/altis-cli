const chalk = require( 'chalk' );
const inquirer = require( 'inquirer' );
const ora = require( 'ora' );

const { getStackRegion, streamLog } = require( './util' );
const Vantage = require( '../../vantage' );

function deploy( vantage, stack, force ) {
	console.log( `Deploying ${stack}...` );

	let url = `stack/applications/${stack}/deploys?stream=true`;
	if ( force ) {
		url += '&force=true';
	}

	const opts = { method: 'POST' };
	return vantage.fetch( url, opts ).then( resp => {
		return resp.text().then( text => {
			if ( ! resp.ok ) {
				throw new Error( text );
			}

			return text;
		});
	});
}

module.exports = function ( argv ) {
	const { config, debug, force } = argv;

	getStackRegion( argv ).then( ( { region, stack } ) => {
		const v = new Vantage( config, region );
		if ( argv.resume ) {
			streamLog( v, stack, argv.resume, debug );
			return;
		}

		deploy( v, stack, force ).then( id => {
			console.log( chalk.yellow( `Deploy started, resume later with...` ) );
			console.log( chalk.yellow( `  hm stack deploy ${ stack } --resume ${ id }\n` ) );

			streamLog( v, stack, id, debug );
		} );
	} );
};
