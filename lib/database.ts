import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import open from 'open';
import pkg from '@humanmade/ssm';
import { forwardSession, parseSession } from './database-tunnel.ts';
import type { PortSession } from './database-tunnel.ts';
import type { CliArguments, CommandBuilder } from './types/cli.ts';
import type { DatabaseServerResponse } from './types/rest-api.ts';
import { fetchJSON, getStack } from './commands/stack/util.ts';
import Vantage from './vantage.ts';

interface DatabaseSession {
	id: number;
	aws_ssm_session_id: string;
	stream_url: string;
	token: string;
}
type DatabaseCredentials = Pick<DatabaseServerResponse, 'username' | 'password' | 'database'>;
type SessionFactory = (url: string, id: string, token: string) => PortSession;

function sessionFactory(): SessionFactory {
	const Session = pkg.default;
	const prototype = Session.prototype as unknown as Partial<PortSession>;
	if (typeof prototype.writeRaw !== 'function' || typeof prototype.sendHandshakeResponse !== 'function') {
		throw new Error('Database tunnels require the socket support in @humanmade/ssm 0.0.4 or newer; the installed version does not support it.');
	}
	return (url, id, token) => new Session(url, id, token) as unknown as PortSession;
}

export function databaseOptions(parser: CommandBuilder) {
	return parser.option('port', { describe: 'Local loopback port to listen on.', type: 'number', default: 3306 });
}

/** Create one tunnel and terminate the owned AWS session on every exit path. */
export async function createDatabaseTunnel(api: Vantage, stack: string, port: number, createSession = sessionFactory()) {
	const url = `stack/applications/${encodeURIComponent(stack)}/database/sessions`;
	const record = await fetchJSON<DatabaseSession>(api, url, {
		method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ local_port: port }),
	});
	if (!record || !Number.isInteger(record.id) || record.id < 1) {
		throw new Error('Invalid database session response: missing Vantage session ID.');
	}
	const cleanup = () => fetchJSON(api, `${url}/${record.id}`, { method: 'DELETE' });
	let forwarding: ReturnType<typeof forwardSession>;
	try {
		const data = parseSession(JSON.stringify({ id: record.aws_ssm_session_id, stream_url: record.stream_url, token: record.token }));
		forwarding = forwardSession(createSession(data.stream_url, data.id, data.token), port);
	} catch (error) {
		await cleanup();
		throw error;
	}
	const done = forwarding.done.finally(cleanup);
	try {
		await Promise.race([
			once(forwarding.server, 'listening'),
			done.then(() => { throw new Error('Database tunnel closed before it started listening.'); }),
		]);
	} catch (error) {
		forwarding.close();
		await done.catch(() => {});
		throw error;
	}
	return { port, done, close: () => { forwarding.close(); return done; } };
}

function mysqlQuote(value: string) {
	return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
}

export function mysqlConfig(credentials: DatabaseCredentials, port: number) {
	const options = { host: '127.0.0.1', port: String(port), protocol: 'TCP',
		user: credentials.username, password: credentials.password, database: credentials.database };
	return '[client]\n' + Object.entries(options).map(([key, value]) => `${key}=${mysqlQuote(value)}`).join('\n') + '\n';
}

function xml(value: string) {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function sequelConfig(credentials: DatabaseCredentials, port: number, stack: string) {
	const fields = { name: stack, host: '127.0.0.1', user: credentials.username,
		password: credentials.password, database: credentials.database, rdbms_type: 'mysql', type: 'StandardConnection' };
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>auto_connect</key><true/>
<key>ContentFilters</key><dict/>
<key>data</key><dict><key>connection</key><dict>
${Object.entries(fields).map(([key, value]) => `<key>${key}</key><string>${xml(value)}</string>`).join('\n')}
<key>port</key><integer>${port}</integer>
</dict><key>session</key><dict/></dict>
<key>queryFavorites</key><array/><key>queryHistory</key><array/>
<key>rdbms_type</key><string>mysql</string>
<key>encrypted</key><false/><key>format</key><string>connection</string>
<key>version</key><integer>1</integer>
</dict></plist>\n`;
}

/** Keep credentials out of process arguments, environment variables, and logs. */
export async function withConnectionFile<T>(filename: string, content: string, run: (file: string) => Promise<T>) {
	const directory = await mkdtemp(path.join(tmpdir(), 'altis-database-'));
	try {
		const file = path.join(directory, filename);
		await writeFile(file, content, { mode: 0o600 });
		return await run(file);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

export async function launchMysql(file: string, tunnel: { port: number; done: Promise<unknown>; close(): Promise<unknown> }, launch = spawn) {
	const child = launch('mysql', [`--defaults-file=${file}`, '--protocol=TCP', '--host=127.0.0.1', `--port=${tunnel.port}`], { stdio: 'inherit' });
	try {
		const exited = new Promise<void>((resolve, reject) => {
			child.once('error', (error: NodeJS.ErrnoException) => reject(new Error(error.code === 'ENOENT'
				? 'The mysql client is not installed or is not on PATH.' : 'Could not start the mysql client.')));
			child.once('exit', (code, signal) => code === 0 || signal === 'SIGINT' ? resolve()
				: reject(new Error(`mysql exited ${signal ? `with signal ${signal}` : `with status ${code}`}.`)));
		});
		await Promise.race([exited, tunnel.done.then(() => exited)]);
	} finally {
		if (child.exitCode === null && child.signalCode === null) child.kill();
		await tunnel.close();
	}
}

export async function runDatabase(argv: CliArguments, mode: 'tunnel' | 'cli' | 'sequel') {
	const port = argv.port ?? 3306;
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error('--port must be an integer between 1 and 65535.');
	}
	if (mode === 'sequel' && process.platform !== 'darwin') {
		throw new Error('database sequel is supported on macOS. Use database tunnel with your preferred database client.');
	}
	const createSession = sessionFactory();
	const stack = await getStack(argv);
	const api = new Vantage(argv.config);
	let credentials: DatabaseCredentials | undefined;
	if (mode !== 'tunnel') {
		credentials = await fetchJSON<DatabaseServerResponse>(api, `stack/applications/${encodeURIComponent(stack)}/database-server`);
		if (!credentials || typeof credentials.username !== 'string' || !credentials.username
			|| typeof credentials.database !== 'string' || typeof credentials.password !== 'string' || !credentials.password) {
			throw new Error('Database credentials are not available to this account. Use database tunnel with your own credentials.');
		}
	}
	const tunnel = await createDatabaseTunnel(api, stack, port, createSession);
	console.log(`Database tunnel for ${stack} listening on 127.0.0.1:${port}. Ctrl-C to close.`);
	try {
		if (mode === 'cli') {
			await withConnectionFile('client.cnf', mysqlConfig(credentials!, port), file => launchMysql(file, tunnel));
		} else if (mode === 'sequel') {
			await withConnectionFile('connection.spf', sequelConfig(credentials!, port, stack), async file => {
				await open(file, { wait: false });
				await tunnel.done;
			});
		} else {
			await tunnel.done;
		}
	} finally {
		await tunnel.close();
	}
}
