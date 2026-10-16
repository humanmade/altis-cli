
import crypto from 'crypto';
import http from 'http';
import fetch from 'node-fetch';
import open from 'open';
import qs from 'querystring';

interface OAuthTokenRequest { grant_type: 'authorization_code'; code: string; client_id: string; client_secret: string; }
interface OAuthTokenResponse { access_token: string; }

interface AuthorizationOptions {
	endpoints: { authorize: string; exchange: string };
	key: string;
	secret: string;
	port: number;
	render: (title: string, message?: string) => string;
}
class Authenticator {
	options: AuthorizationOptions;
	server: http.Server;
	state: string;
	promise!: Promise<string>;

	constructor( options: AuthorizationOptions ) {
		this.options = options;
		this.server = http.createServer();
		// Create state to carry around.
		this.state = crypto.randomBytes( 12 ).toString( 'base64' );
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

	exchangeCode( code: string ) {
		// Exchange for a token.
		const params: OAuthTokenRequest = {
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
			body: qs.stringify( { ...params } ),
		};
		return fetch( this.options.endpoints.exchange, opts )
			.then( resp => resp.json() as Promise<OAuthTokenResponse> )
			.then( data => {
				const token = data.access_token;
				return token;
			} );
	}

	handleRequest( req: http.IncomingMessage, res: http.ServerResponse ) {
		const params = new URL( req.url || '/', `http://localhost:${ this.options.port }` ).searchParams;
		const states = params.getAll( 'state' );
		const code = params.getAll( 'code' ).join( ',' );
		res.setHeader( 'Content-Type', 'text/html' );

		// Check that state is present and matches our expected.
		if ( states.length !== 1 || states[0] !== this.state ) {
			res.writeHead( 400 );
			res.end( this.options.render( 'Invalid state parameter.' ) );
			return Promise.resolve( null );
		}
		if ( ! code ) {
			res.writeHead( 400 );
			res.end( this.options.render( 'Missing code parameter.' ) );
			return Promise.resolve( null );
		}

		res.writeHead( 200 );
		res.end( this.options.render( 'Authenticated altis-cli!', 'You can now close this window and go back to your terminal.' ) );

		return this.exchangeCode( code );
	}

	start() {
		this.promise = new Promise<string>( ( resolve, reject ) => {
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
				if ( (err as NodeJS.ErrnoException).code === 'EADDRINUSE' ) {
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

export default function(opts: AuthorizationOptions) {
	const options = Object.assign<Partial<AuthorizationOptions>, AuthorizationOptions>(
		{
			port: 4101,
			render: ( title: string, message?: string ) => `<!doctype html><html><body><h1>${ title }</h1><p>${ message }</p></body></html>`,
		},
		opts
	);
	if ( ! options.key || ! options.endpoints ) {
		throw new Error( 'Missing required configuration' );
	}

	const authenticator = new Authenticator( options );
	return authenticator.start();
}
