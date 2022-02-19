const chalk = require( 'chalk' );
const ora = require( 'ora' );
const { format, parse } = require( 'url' );

const Vantage = require( '../../vantage' );

const handler = function ( argv ) {
	const { config, stack, before, after } = argv;

	const v = new Vantage( config );

	const status = new ora( `Fetching PHP Logs for ${ stack }` );
	status.start();

	if ( argv.tail ) {
		if ( argv.before || argv.after ) {
			status.fail( '--before and --after are not supported with the --tail option.' );
			return;
		}
		v.getLogStream( { id: stack, log: `${ stack }/php` } ).then( stream => {
			stream.on( 'open', () => status.succeed( chalk.bold.yellow( 'Connected!' ) ) );
			stream.on( 'close', () => {
				status.fail( `Disconnected from ${stack}` );
			} );

			stream.on( 'data', ( { type, data } ) => {
				switch ( type ) {
					case 'log':
						const parsed = JSON.parse( data );
						console.log( parsed );
						break;
				}
			} );
		} );
	} else {
		const urlObj = parse( `stack/applications/${ stack }/logs/php`, true );
		const args = {};
		if ( argv.before ) {
			args.before = argv.before;
		}
		if ( argv.after ) {
			args.after = argv.after;
		}
		urlObj.query = args;

		const url = format( urlObj );
		v.fetch( url ).then( resp => {
			// hm-stack currently returns a 500 for invalid stacks, so we have to
			// assume any failure is a 404: https://github.com/humanmade/hm-stack/issues/367
			if ( ! resp.ok ) {
				status.fail( `Invalid stack ${stack}` );
				throw new Error( `Invalid stack ${stack}` );
			}
			return resp.json();
		} ).then( logs => {
			status.succeed( chalk.bold.green( 'Complete!' ) );
			logs.map( log => console.log( log.message ) );
		} ).catch( e => {
			status.fail( `Could not fetch details for ${stack}` );
			throw e;
		} );
	}
};
module.exports = {
    command: 'php-logs [stack]',
    description: 'Show PHP logs for a stack.',
    builder: subcommand => {
        subcommand.option( 'before', {
            description: 'Date to logs must be before.',
            type: 'string',
        } );

        subcommand.option( 'after', {
            description: 'Date to logs must be after.',
            type: 'string',
        } );

        subcommand.option( 'tail', {
            description: 'Live update log entries.',
            type: 'boolean',
        } );
    },
    handler,
};
