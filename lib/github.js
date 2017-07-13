const fetch = require( 'node-fetch' );
const ghslug = require('github-slug')
const ghauth = require( 'ghauth' );
const { resolve } = require( 'url' );

const authOptions = {
	noSave: true,
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
	constructor( config ) {
		this.config = config;
		this.authPromise = null;
	}

	authenticate() {
		if ( this.authPromise ) {
			return this.authPromise;
		}

		// Load from config if we can.
		const saved = this.config.get( 'github' );
		if ( saved && saved.token ) {
			this.authPromise = Promise.resolve( saved );
			return this.authPromise;
		}

		this.authPromise = new Promise((resolve, reject) => {
			ghauth( authOptions, (err, data) => {
				if ( err ) {
					return reject( err );
				}

				return this.config.set( 'github', data ).then( () => data );
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
