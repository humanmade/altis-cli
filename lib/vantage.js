const chalk = require( 'chalk' );
const fetch = require( 'node-fetch' );
const http = require( 'http' );
const { format, parse, resolve } = require( 'url' );

const authorize = require( './authorize' );
const { CFG_NAME } = require( './config' );
const stream = require('./stream')

const authOptions = {
	agent: process.env.SSH_AUTH_SOCK,
};
const REGIONS = [
	'ap-southeast-1',
	'ap-southeast-2',

	'eu-central-1',
	'eu-west-1',
	'eu-west-2',

	'us-east-1',
	'us-west-1',
];
const STACK_CACHE_LIFETIME = 24 * 60 * 60 * 1000;

const AUTH_ENDPOINT = 'https://central.aws.hmn.md/wp-login.php?action=oauth2_authorize';
const TOKEN_ENDPOINT = 'https://central.aws.hmn.md/wp-json/oauth2/access_token';
const OAUTH_KEY = 'za6qrd2teuev';
const OAUTH_SECRET = 'kZCn1dluko2lout6gnDqsGqhYn9a7ICFX8YdOhBSd8hhD1w3';
const OAUTH_PORT = 7277; // ASCII "H" + "M"

class VantageAPI {
	constructor( config, region ) {
		this.config = config;
		const sshConfig = config.get( 'ssh' ) || {};
		this.proxyUser = sshConfig.user || process.env.USER;
		this.proxyRegion = sshConfig.proxyRegion || region;
		if ( this.proxyRegion === 'auto' ) {
			this.proxyRegion = this.region;
		}

		this.region = region;
		this.baseUrl = `https://${this.region}.aws.hmn.md/api/`;
		this.authPromise = null;
	}

	authenticate() {
		if ( this.authPromise ) {
			return this.authPromise;
		}

		// Do we have a token stored?
		const token = this.config.get( 'vantage_token' );
		if ( token ) {
			this.authPromise = Promise.resolve( { token } );
			return this.authPromise;
		}

		const opts = {
			endpoints: {
				authorize: AUTH_ENDPOINT,
				exchange: TOKEN_ENDPOINT,
			},
			key: OAUTH_KEY,
			secret: OAUTH_SECRET,
			port: OAUTH_PORT,
			render: message => {
				return `
				<!doctype html>
				<html>
				<head>
					<link rel="stylesheet" href="https://humanmade.github.io/hm-pattern-library/assets/styles/juniper.css" />
					<title>hm-cli</title>
					<style>
						article {
							max-width: 40rem;
							margin: 0 auto;
						}
					</style>
				</head>
				<body>
					<article>
						<i class="hm-logo hm-logo--small hm-logo--red">Human Made</i>
						<h1>hm-cli</h1>
						<p>${ message }</p>
					</article>
				</body>
				</html>
				`.replace( /^\s+/gm, '' );
			},
		};
		this.authPromise = authorize( opts )
			.then( token => {
				// Store for later use.
				this.config.set( 'vantage_token', token );
				return { token };
			} );
		return this.authPromise;
	}

	fetch( url, opts = {} ) {
		const absUrl = resolve( this.baseUrl, url );
		return this.authenticate().then( ( { token } ) => {
			const options = Object.assign( {}, opts, {
				headers: Object.assign(
					{},
					opts.headers || {},
					{
						Authorization: `Bearer ${ token }`,
					},
				),
			} );
			return fetch( absUrl, options );
		});
	}

	getLogStream( args ) {
		const urlObj = parse( resolve( this.baseUrl, '/stream-log' ), true );
		urlObj.query = args;
		const absUrl = format( urlObj );
		return this.authenticate().then( ({ agent }) => {
			const opts = {
				request: {
					agent,
				},
			};
			return stream( absUrl, opts );
		});
	}
}

/**
 * Get a map of all stacks with their region.
 *
 * @return {object} Map of region => list of stacks.
 */
function getStacks( config, cacheStatus = () => {} ) {
	const cached = config.get( 'stack-cache' );
	if ( cached && Date.now() < cached.timestamp + STACK_CACHE_LIFETIME ) {
		cacheStatus( cached.timestamp );
		return Promise.resolve( cached.stacks );
	}

	cacheStatus( null );
	return Promise.all(
		REGIONS.map( region => {
			const vantage = new VantageAPI( config, region );
			return vantage.fetch( 'stack/applications' )
				.then( resp => resp.json() )
				.then( stacks => [ region, stacks ] )
				.catch( e => [ region, e ] );
		} )
	).then( regions => {
		const regionMap = {};
		regions.forEach( ( [ region, result ] ) => {
			if ( result instanceof Error ) {
				console.warn( `Unable to load ${ region }` );
				return;
			}

			regionMap[ region ] = result.map( stack => stack.id );
		} );

		return regionMap;
	} ).then( stacks => {
		config.set( 'stack-cache', {
			timestamp: Date.now(),
			stacks
		} );
		return stacks;
	} );
}

/**
 * Get the region for a stack.
 *
 * @param {string} stack Stack ID.
 * @return {Promise} Promise resolving to region name.
 */
function getRegion( config, stack, cacheStatus ) {
	return getStacks( config, cacheStatus )
		.then( map => {
			const region = Object.keys( map ).find( region => map[ region ].indexOf( stack ) >= 0 );
			return region;
		} );
}

module.exports = VantageAPI;
module.exports.REGIONS = REGIONS;
module.exports.getRegion = getRegion;
module.exports.getStacks = getStacks;
