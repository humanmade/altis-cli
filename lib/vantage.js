const chalk = require( 'chalk' );
const fetch = require( 'node-fetch' );
const http = require( 'http' );
const sshAgent = require('http-ssh-agent')
const { resolve, URL, URLSearchParams } = require( 'url' );

const { CFG_NAME } = require( './config' );
const stream = require('./stream')

const authOptions = {
	agent: process.env.SSH_AUTH_SOCK,
};

class VantageAPI {
	constructor( region, proxyRegion = null ) {
		this.region = region;
		this.proxyRegion = proxyRegion || region;
		this.baseUrl = `http://${this.region}.aws.hmn.md/api/`;
		this.authPromise = null;
	}

	authenticate() {
		if ( this.authPromise ) {
			return this.authPromise;
		}

		// Connect to the proxy.
		this.authPromise = new Promise((resolve, reject) => {
			const agent = sshAgent( `ryan@${this.proxyRegion}.aws.hmn.md`, authOptions );
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
		const urlObj = new URL( resolve( this.baseUrl, '/stream-log' ) );
		urlObj.search = new URLSearchParams( args );
		const absUrl = urlObj.href;
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
