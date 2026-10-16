
import crypto from 'crypto';
import http from 'http';
import fetch from 'node-fetch';
import open from 'open';
import qs from 'querystring';

interface AuthorizationOptions {
	endpoints: { authorize: string; exchange: string };
	key: string;
	secret: string;
	port: number;
	render: (title: string, message?: string) => string;
}
export class Authenticator {
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
		return open( url );
	}

	exchangeCode( code: string ) {
		// Exchange for a token.
		const params = {
			grant_type: 'authorization_code',
			code,
			client_id: this.options.key,
			client_secret: this.options.secret,
		};
		const opts = {
			signal: AbortSignal.timeout( 30_000 ),
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: qs.stringify( params ),
		};
		return fetch( this.options.endpoints.exchange, opts )
			.then( async resp => {
				if ( ! resp.ok ) throw new Error( `OAuth token exchange failed (HTTP ${ resp.status }).` );
				try { return await resp.json(); }
				catch { throw new Error( 'OAuth token exchange returned invalid JSON.' ); }
			} )
			.then( data => {
				const token = data && typeof data === 'object' && 'access_token' in data ? data.access_token : undefined;
				if ( typeof token !== 'string' || ! token.trim() ) throw new Error( 'OAuth token exchange did not return an access token.' );
				return token;
			} );
	}

	async handleRequest( req: http.IncomingMessage, res: http.ServerResponse ) {
		const params = new URL( req.url || '/', `http://localhost:${ this.options.port }` ).searchParams;
		const states = params.getAll( 'state' );
		const code = params.getAll( 'code' ).join( ',' );
		res.setHeader( 'Content-Type', 'text/html' );

		// Check that state is present and matches our expected.
		if ( states.length !== 1 || states[0] !== this.state ) {
			res.writeHead( 400 );
			res.end( this.options.render( 'Invalid state parameter.' ) );
			return null;
		}
		if ( ! code ) {
			res.writeHead( 400 );
			res.end( this.options.render( 'Missing code parameter.' ) );
			return null;
		}

		try {
			const token = await this.exchangeCode( code );
			res.writeHead( 200 );
			res.end( this.options.render( 'Authenticated altis-cli!', 'You can now close this window and go back to your terminal.' ) );
			return token;
		} catch ( error ) {
			res.writeHead( 502 );
			res.end( this.options.render( 'Authentication failed.', 'Token exchange failed. See your terminal for details.' ) );
			throw error;
		}
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
				reject( err );
			} );

			this.server.listen( this.options.port, () => { this.startAuthorization().catch( reject ); } );
		} );
		void this.promise.then( () => this.server.close(), () => this.server.close() );
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
