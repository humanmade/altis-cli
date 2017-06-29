const fetch = require( 'node-fetch' );
const ghslug = require('github-slug')
const ghauth = require( 'ghauth' );
const { resolve } = require( 'url' );

const { CFG_NAME } = require( './config' );

const authOptions = {
	configName: CFG_NAME,
	scopes: [
		'user',
		'public_repo',
		'repo',
		'gist',
	],
	note: 'Human Made CLI (humanmade/cli)',
	userAgent: 'humanmade/cli'
};

const BASE_URL = 'https://api.github.com/';

class GitHubAPI {
	constructor() {
		this.authPromise = null;
	}

	authenticate() {
		if ( this.authPromise ) {
			return this.authPromise;
		}

		this.authPromise = new Promise((resolve, reject) => {
			ghauth( authOptions, (err, data) => {
				if ( err ) {
					reject( err );
				} else {
					resolve( data );
				}
			});
		});
		return this.authPromise;
	}

	getRepo( dir ) {
		return new Promise( (resolve, reject) => ghslug( dir, (err, slug) => {
			if ( err ) {
				reject( err );
			} else {
				resolve( slug );
			}
		}));
	}

	fetch( url, opts = {} ) {
		const absUrl = resolve( BASE_URL, url );
		return this.authenticate().then( ({ token }) => {
			const options = Object.assign( {}, { headers: {} }, opts );

			const authHeader = `Bearer ${token}`;
			options.headers = Object.assign( {}, { Authorization: authHeader }, opts.headers );

			return fetch( absUrl, options );
		});
	}
}

module.exports = GitHubAPI;
