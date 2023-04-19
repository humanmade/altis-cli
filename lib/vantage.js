const chalk = require( 'chalk' );
const fetch = require( 'node-fetch' );
const fs = require( 'fs' );
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

const AUTH_ENDPOINT = 'https://dashboard.altis-dxp.com/wp-login.php?action=oauth2_authorize';
const BASE_URL = process.env.VANTAGE_URL || 'https://dashboard.altis-dxp.com/api/';
const TOKEN_ENDPOINT = `${ BASE_URL }oauth2/access_token`;
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
			render: ( title, message ) => {
				return `
				<!doctype html>
				<html class="h-full">
				<head>
				<style>
				${ fs.readFileSync( __dirname + '/success.css' ) }
				</style>
				<body class="flex h-full min-w-full justify-center items-center">
					<article class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
						<div class="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-sm sm:p-6">
							<div>
								<div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
									<svg class="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
										<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
									</svg>
								</div>
								<div class="mt-3 text-center sm:mt-5">
									<h3 class="text-base font-semibold leading-6 text-gray-900" id="modal-title">${ title }</h3>
									<div class="mt-2">
										<p class="text-sm text-gray-500">${ message }</p>
									</div>
								</div>
							</div>
						</div>
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
		const urlObj = parse( resolve( BASE_URL, '/stream-log' ), true );
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
