const chalk = require( 'chalk' );
const columnify = require( 'columnify' );
const indentString = require( 'indent-string' );
const logUpdate = require( 'log-update' );
const ora = require( 'ora' );

const { getStackRegion, renderCommit, renderRepo } = require( './util' );
const Vantage = require( '../../vantage' );

const COLUMN_OPTS = {
	showHeaders: false,
	preserveNewLines: true,
	columnSplitter: '   ',
	config: {
		key: {
			minWidth: 12,
			dataTransform: data => chalk.bold( data ),
		},
	},
};

const REL_WEB_SERVER = 'https://hm-stack.hm/web-server';
const REL_ES_SERVER = 'https://hm-stack.hm/elasticsearch-cluster';
const REL_DB_SERVER = 'https://hm-stack.hm/database-server';
const REL_LB_SERVER = 'https://hm-stack.hm/load-balancer';

const getInfoTable = ( info, indent = 4 ) => {
	return indentString( columnify( info, Object.assign( {}, COLUMN_OPTS ) ), indent );
};

const printInfo = ( title, info, indent = 2 ) => {
	console.log( indentString( chalk.bold( title ), indent ) );
	console.log( getInfoTable( info, indent + 2 ) );
};

const highlightHostId = ( host, id ) => {
	const rest = host.replace( id, '' );
	return id + chalk.grey( rest );
};

module.exports = function ( argv ) {
	const { config, region } = argv;

	getStackRegion( argv ).then( ( { stack, region } ) => {
		const v = new Vantage( config, region );

		const status = new ora( `Fetching information for ${stack}@${region} (proxying via ${v.proxyRegion})` );
		status.start();
		v.fetch( `stack/applications/${ stack }?_embed` )
			.then( resp => resp.json() )
			.then( data => {
				status.stop();

				console.log( '' );

				const displayStatus = data.status === 'available' ? chalk.green( data.status ) : chalk.yellow( data.status );
				const lbServer = data._embedded[ REL_LB_SERVER ][0];

				printInfo(
					data.id,
					{
						Status:          displayStatus,
						Domains:         data.domains.join( chalk.grey( ', ' ) ),
						'Load Balancer': highlightHostId( lbServer.hostname, lbServer.id ),
					},
					0
				);

				console.log( '' );
				printInfo(
					'Infrastructure',
					{
						Version: `${ data.architecture } ${ chalk.grey( `(${ data.version })` ) }`,
						AMI:     data.ami,
						Type:    data['instance-type'],
					}
				);

				const deployment = data['git-deployment'];
				const commit = deployment.branch_details.latest_commit;
				console.log( '' );
				printInfo(
					'Deployment',
					{
						Source:      `${ deployment.url } ${ chalk.grey( '@' ) } ${ chalk.blue( deployment.ref ) }`,
						// TODO: this doesn't seem to be accurate?
						// Autoupdating: deployment.is_autoupdating ? chalk.green( 'Yes' ) : chalk.grey( 'No' ),
						Commit:       commit.rev + chalk.grey( ` (${ commit.user.name })` )
						              + '\n' + chalk.grey( `${ commit.description }` ),
					}
				);

				const dbServer = data._embedded[ REL_DB_SERVER ][0];
				const dbHost = dbServer.hostname.replace( dbServer.id, '' );
				console.log( '' );
				printInfo(
					'Database',
					{
						ID:     highlightHostId( dbServer.hostname, dbServer.id ),
						Status: dbServer.status === 'available' ? chalk.green( dbServer.status ): chalk.yellow( dbServer.status ),
						Size:   dbServer.size,
					}
				);

				const webServers = data._embedded[ REL_WEB_SERVER ][0];
				const webServersHeader = chalk.bold( 'Web Servers' ) + chalk.grey( ` (${ webServers.length })` );
				console.log( '\n' + indentString( webServersHeader, 2 ) );
				webServers.forEach( server => {
					printInfo(
						server.id,
						{
							IP:     server['ip-address'],
							Status: server.status === 'running' ? chalk.green( server.status ) : chalk.yellow( server.status ),
							Size:   server.size,
							Locked: server['scale-in-protection'] ? chalk.bold.red( 'Locked' ) : chalk.grey( 'No' ),
						},
						4
					);
					console.log( '' );
				} );

				const esServer = data._embedded[ REL_ES_SERVER ][0];
				if ( esServer.id ) {
					printInfo(
						'Elasticsearch',
						{
							ID:       esServer.id,
							Size:     esServer.size,
							Endpoint: esServer.endpoint,
						}
					);
				} else {
					console.log( indentString( chalk.bold( 'Elasticsearch   ' ) + chalk.grey( 'Disabled' ), 2 ) );
				}

				console.log( '' );
			} )
			.catch( e => {
				status.stop();
				throw e;
			} );
	} );
};
