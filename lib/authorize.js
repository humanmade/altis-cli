const crypto = require( 'crypto' );
const http = require( 'http' );
const fetch = require( 'node-fetch' );
const open = require( 'open' );
const qs = require( 'querystring' );
const url = require( 'url' );

class Authenticator {
	constructor( options ) {
		this.options = options;
		this.server = http.createServer();
		// Create state to carry around.
		this.state = new Buffer( crypto.randomBytes( 12 ) ).toString( 'base64' );
	}

	startAuthorization() {
		const params = {
			client_id: this.options.key,
			response_type: 'code',
			state: this.state,
		};

		const url = `${ this.options.endpoints.authorize }&${ qs.stringify( params ) }`;
		open( url );
	}

	exchangeCode( code ) {
		// Exchange for a token.
		const params = {
			grant_type: 'authorization_code',
			code,
			client_id: this.options.key,
			client_secret: this.options.secret,
		};
		const opts = {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: qs.stringify( params ),
		};
		return fetch( this.options.endpoints.exchange, opts )
			.then( resp => resp.json() )
			.then( data => {
				const token = data.access_token;
				return token;
			} );
	}

	handleRequest( req, res ) {
		const bits = url.parse( req.url, true );
		res.setHeader( 'Content-Type', 'text/html' );

		// Check that state is present and matches our expected.
		if ( ! bits.query.state || bits.query.state !== this.state ) {
			res.writeHeader( 400 );
			res.end( this.options.render( 'Invalid state parameter.' ) );
			return Promise.resolve( null );
		}
		if ( ! bits.query.code ) {
			res.writeHeader( 400 );
			res.end( this.options.render( 'Missing code parameter.' ) );
			return Promise.resolve( null );
		}

		res.writeHead( 200 );
		res.end( this.options.render( 'Authenticated altis-cli!', 'You can now close this window and go back to your terminal.' ) );

		return this.exchangeCode( bits.query.code );
	}

	start() {
		this.promise = new Promise( ( resolve, reject ) => {
			this.server.on( 'request', ( req, res ) => {
				this.handleRequest( req, res )
					.then( res => {
						if ( res ) {
							resolve( res );
						}
					} )
					.catch( err => reject( err ) );
			} );

			this.server.on( 'error', err => {
				if ( err.code === 'EADDRINUSE' ) {
					reject( new Error( `Port ${ this.options.port } is already in use.` ) );
					return;
				}
			} );

			this.server.listen( this.options.port, () => this.startAuthorization() );
		} );
		this.promise.then( () => this.server.close() );
		this.promise.catch( err => this.server.close() );
		return this.promise;
	}
}

// Start internal server for redirect back.
module.exports = opts => {
	const options = Object.assign(
		{
			endpoints: null,
			key: null,
			secret: null,
			port: 4101,
			render: ( title, message ) => `<!doctype html><html><body><h1>${ title }</h1><p>${ message }</p></body></html>`,
		},
		opts
	);
	if ( ! options.key || ! options.endpoints ) {
		throw new Error( 'Missing required configuration' );
	}

	const authenticator = new Authenticator( options );
	return authenticator.start();
};
