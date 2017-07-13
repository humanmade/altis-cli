const chalk = require( 'chalk' );
const fetch = require( 'node-fetch' );
const http = require( 'http' );
const sshAgent = require('http-ssh-agent')
const { format, parse, resolve } = require( 'url' );

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

class VantageAPI {
	constructor( config, region ) {
		const sshConfig = config.get( 'ssh' ) || {};
		this.proxyUser = sshConfig.user || process.env.USER;
		this.proxyRegion = sshConfig.proxyRegion || region;
		if ( this.proxyRegion === 'auto' ) {
			this.proxyRegion = this.region;
		}

		this.region = region;
		this.baseUrl = `http://${this.region}.aws.hmn.md/api/`;
		this.authPromise = null;
	}

	authenticate() {
		if ( this.authPromise ) {
			return this.authPromise;
		}

		// Connect to the proxy.
		this.authPromise = new Promise((resolve, reject) => {
			const agent = sshAgent( `${this.proxyUser}@${this.proxyRegion}.aws.hmn.md`, authOptions );
			resolve({ agent });
		});
		return this.authPromise;
	}

	fetch( url, opts = {} ) {
		const absUrl = resolve( this.baseUrl, url );
		return this.authenticate().then( ({ agent }) => {
			const options = Object.assign( {}, { agent }, opts );
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

module.exports = VantageAPI;
module.exports.REGIONS = REGIONS;