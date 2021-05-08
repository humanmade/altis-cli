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
const BASE_URL = process.env.VANTAGE_URL || 'https://eu-west-1.aws.hmn.md/api/';
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
		const absUrl = resolve( BASE_URL, url );
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
		return this.authenticate().then( ( { token } ) => {
			const opts = {
				request: {
					headers: {
						Authorization: `Bearer ${ token }`,
					},
				},
			};
			return stream( absUrl, opts );
		});
	}
}

/**
 * Get a map of all stacks with their region.
 *
 * @return {array} List of stacks.
 */
function getStacks( config ) {
	const cached = config.cache.get( 'stacks' );
	if ( cached && Date.now() < cached.timestamp + STACK_CACHE_LIFETIME ) {
		return Promise.resolve( cached.stacks );
	}

	// Cache miss, load again:
	const vantage = new VantageAPI( config );
	return vantage.fetch( 'stack/applications' )
		.then( resp => resp.json() )
		.then( data => data.map( stack => stack.id ) )
		.then( stacks => {
			config.cache.set( 'stacks', {
				timestamp: Date.now(),
				stacks
			} );
			return stacks;
		})
		.catch( e => {
			// Silently ignore, until we support verbose output.
			// console.warn( `Unable to load ${ region }` );
			return [];
		} );
}

module.exports = VantageAPI;
module.exports.getStacks = getStacks;
