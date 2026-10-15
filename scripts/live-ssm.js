#!/usr/bin/env node
// Opt-in integration checks. Never imported by npm test or run in CI.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const exec = promisify(execFile);
const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
const digest = buffer => createHash('sha256').update(buffer).digest('hex');

export class LiveSession {
	constructor(session, timeoutMs) {
		this.session = session;
		this.timeoutMs = timeoutMs;
		this.output = '';
		this.waiters = new Set();
		this.disconnected = false;
		session.on('output', chunk => {
			this.output += chunk;
			if (this.output.length > 32 * 1024 * 1024) {
				this.fail(new Error('Session output exceeded 32 MiB'));
				return;
			}
			for (const check of [...this.waiters]) check();
		});
		this.closed = new Promise(resolve => session.on('disconnect', () => {
			this.disconnected = true;
			this.fail(new Error('Session disconnected before the command completed'));
			resolve();
		}));
		session.webSocket?.on?.('error', () => this.fail(new Error('SSM WebSocket error')));
	}

	fail(error) {
		this.error = error;
		for (const check of [...this.waiters]) check();
	}

	waitFor(pattern, start = 0, timeoutMs = this.timeoutMs) {
		return new Promise((resolve, reject) => {
			const finish = (error, result) => {
				clearTimeout(timer);
				this.waiters.delete(check);
				error ? reject(error) : resolve(result);
			};
			const check = () => {
				const result = pattern.exec(this.output.slice(start));
				if (result) finish(null, result);
				else if (this.error) finish(this.error);
			};
			const timer = setTimeout(() => finish(new Error('Timed out waiting for remote output')), timeoutMs);
			this.waiters.add(check);
			check();
		});
	}

	async run(command) {
		if (this.error) throw this.error;
		// Split markers in the command so PTY input echo cannot satisfy a waiter.
		const nonce = randomBytes(12).toString('hex');
		const start = this.output.length;
		const completed = this.waitFor(new RegExp(`__SSM_BEGIN_${nonce}\\r?\\n([\\s\\S]*?)\\r?\\n__SSM_END_${nonce}:(\\d+)\\r?\\n`), start);
		try {
			this.session.write(`printf '\\n%s%s\\n' '__SSM_BEGIN_' '${nonce}'; ( ${command} ); _ssm_code=$?; printf '\\n%s%s:%s\\n' '__SSM_END_' '${nonce}' "$_ssm_code"\n`);
		} catch (error) {
			this.fail(error);
		}
		const [, output, code] = await completed;
		if (code !== '0') {
			const error = new Error(`Remote command exited with status ${code}`);
			error.exitCode = Number(code);
			throw error;
		}
		return output.replaceAll('\r\n', '\n');
	}

	async waitClosed() {
		let timer;
		try {
			await Promise.race([this.closed, new Promise((_, reject) => {
				timer = setTimeout(() => reject(new Error('Session did not close within 5 seconds')), 5000);
			})]);
		} finally {
			clearTimeout(timer);
		}
	}

	async close() {
		if (this.disconnected) return;
		try {
			// Closing the WebSocket can leave docker exec's shell running.
			this.session.write('exit\n');
			await this.waitClosed();
		} finally {
			this.session.close();
			if (!this.disconnected) this.session.webSocket?.terminate?.();
		}
	}
}

function options(args) {
	const { values } = parseArgs({ args, options: {
		app: { type: 'string' }, help: { type: 'boolean', short: 'h' },
		'dry-run': { type: 'boolean' }, timeout: { type: 'string', default: '60' },
		idle: { type: 'string', default: '65' }, bytes: { type: 'string', default: '1048576' },
		iterations: { type: 'string', default: '3' }, report: { type: 'string' },
		'skip-scp': { type: 'boolean' }, 'keep-going': { type: 'boolean' },
	} });
	if (values.help) return values;
	if (!values.app || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(values.app)) throw new Error('Supply an explicit application ID with --app <app>.');
	for (const [name, minimum, maximum] of [['timeout', 5, 600], ['idle', 0, 600], ['bytes', 1024, 16 * 1024 * 1024], ['iterations', 1, 20]]) {
		const value = Number(values[name]);
		if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`--${name} must be an integer from ${minimum} to ${maximum}.`);
		values[name] = value;
	}
	return values;
}

export async function main(args = process.argv.slice(2)) {
	const opts = options(args);
	if (opts.help) {
		console.log(`Usage: npm run test:live:ssm -- --app <app> [options]

Live SSM/CLI checks using your existing Altis CLI login and installed SSM package.
Creates temporary files in the sandbox /tmp, then removes them. No database calls.
Not part of npm test or CI. Requires a built CLI (npm run build).

  --timeout <seconds>   Per-command timeout (default 60; SCP uses at least 120)
  --idle <seconds>      Idle connection test with 30-second pings (default 65)
  --bytes <count>       Large SCP round-trip size (default 1048576)
  --iterations <count> Fresh connections to check (default 3)
  --skip-scp           Run session checks only
  --keep-going         Continue assertion failures while the session stays healthy
  --report <path>      Write a JSON result report without tokens or session output
  --dry-run            Print the plan without authentication or network access`);
		return;
	}
	const plan = ['connect and shell readiness', 'ASCII and UTF-8 output', 'fragmented interactive input', '256 KiB output integrity', 'terminal resizing', 'remote failure handling', `idle for ${opts.idle}s with keepalive`, ...(opts['skip-scp'] ? [] : ['empty, binary, and large SCP round trips']), 'simultaneous sessions', `${opts.iterations} fresh sessions`, 'remote exit and cleanup'];
	console.log(`Target: ${opts.app}\n${plan.map(name => `  - ${name}`).join('\n')}`);
	if (opts['dry-run']) return;
	const root = new URL('../', import.meta.url);
	const require = createRequire(root);
	const [{ default: Config }, { default: Vantage }, { default: pkg }] = await Promise.all([
		import(new URL('dist/lib/config.js', root)), import(new URL('dist/lib/vantage.js', root)), import('@humanmade/ssm'),
	]);
	const config = new Config();
	await config.load();
	if (!config.get('vantage_token')) throw new Error('Log in with altis-cli first; the live script does not start interactive authentication.');
	const api = new Vantage(config);
	const local = await mkdtemp(path.join(tmpdir(), 'altis-ssm-live-'));
	const remote = `/tmp/altis-ssm-live-${randomUUID()}`;
	const clients = new Set();
	const abort = new AbortController();
	const secrets = [config.get('vantage_token')];
	const safe = value => secrets.reduce((text, secret) => secret ? text.replaceAll(secret, '[redacted]') : text, String(value)).replace(/wss?:\/\/[^\s]+/g, '[websocket URL]');
	const report = { app: opts.app, started: new Date().toISOString(), ssm: require.resolve('@humanmade/ssm'), ssmVersion: require('@humanmade/ssm/package.json').version, ssmDependency: require(fileURLToPath(new URL('package.json', root))).dependencies['@humanmade/ssm'], nodeVersion: process.version, options: opts, checks: [] };
	const interrupt = () => {
		abort.abort();
		for (const client of clients) client.fail(new Error('Interrupted'));
	};
	process.once('SIGINT', interrupt);
	process.once('SIGTERM', interrupt);
	let primary;
	let directoryCreated = false;
	let failed = false;
	async function check(name, callback) {
		const start = performance.now();
		console.log(`RUN  ${name}`);
		try {
			abort.signal.throwIfAborted();
			await callback();
			report.checks.push({ name, passed: true, ms: Math.round(performance.now() - start) });
			console.log(`PASS ${name}`);
		} catch (error) {
			report.checks.push({ name, passed: false, ms: Math.round(performance.now() - start), error: safe(error.message) });
			if (opts['keep-going'] && error.code === 'ERR_ASSERTION' && primary && !primary.error) {
				failed = true;
				process.exitCode = 1;
				console.error(`FAIL ${name}: ${safe(error.message)}`);
				return;
			}
			throw error;
		}
	}
	async function connect(cleanup = false) {
		const timeoutMs = (cleanup ? 10 : opts.timeout) * 1000;
		const signal = cleanup ? AbortSignal.timeout(timeoutMs) : AbortSignal.any([abort.signal, AbortSignal.timeout(timeoutMs)]);
		const response = await api.fetch(`stack/applications/${opts.app}/cli/sessions`, { method: 'POST', signal });
		if (!response.ok) throw new Error(`Session API returned HTTP ${response.status}`);
		const data = await response.json();
		if (data.error) throw new Error(`Session API failed: ${safe(data.error)}`);
		assert.ok(data.stream_url && data.aws_ssm_session_id && data.token, 'Session API omitted connection details');
		secrets.push(data.token, data.stream_url);
		const session = new pkg.default(data.stream_url, data.aws_ssm_session_id, data.token);
		const client = new LiveSession(session, timeoutMs);
		clients.add(client);
		let timer;
		let onAbort;
		try {
			await new Promise((resolve, reject) => {
				timer = setTimeout(() => reject(new Error('SSM connection timed out')), timeoutMs);
				onAbort = () => reject(new Error('SSM connection interrupted or timed out'));
				signal.addEventListener('abort', onAbort, { once: true });
				if (signal.aborted) onAbort();
				session.on('connect', resolve);
				session.on('disconnect', () => reject(new Error('SSM connection failed')));
				session.webSocket?.on?.('error', () => reject(new Error('SSM WebSocket error')));
			});
		} finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort); }
		session.setSize(120, 30);
		await delay(700, undefined, { signal: cleanup ? undefined : abort.signal });
		assert.ok(await client.run('stty -echo && printf ready') === 'ready', 'Remote shell was not ready');
		return client;
	}
	async function scp(source, destination) {
		try {
			await exec(process.execPath, [fileURLToPath(new URL('dist/bin/altis-cli.js', root)), 'app', 'scp', source, destination], {
				cwd: fileURLToPath(root), timeout: Math.max(120, opts.timeout) * 1000,
				signal: abort.signal, killSignal: 'SIGKILL', maxBuffer: 2 * 1024 * 1024,
				env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
			});
		} catch (error) {
			// Do not include raw session output or connection URLs in reports.
			throw new Error(`CLI scp failed (${error.killed ? 'timeout' : error.code || 'interrupted'})`);
		}
	}
	try {
		console.log(`SSM module: ${report.ssm}`);
		await check('connect and shell readiness', async () => {
			primary = await connect();
			await primary.run(`umask 077; mkdir ${quote(remote)}`);
			directoryCreated = true;
			// The parent shell also cleans up if it exits normally.
			primary.session.write(`trap ${quote(`rm -rf -- ${quote(remote)}`)} EXIT\n`);
		});
		await check('ASCII and UTF-8 output', async () => {
			assert.ok(await primary.run("printf 'hello'; printf '\\342'; sleep 0.1; printf '\\230\\203'; printf ' café 日本語 🐙'") === 'hello☃ café 日本語 🐙', 'ASCII/UTF-8 output differed');
		});
		await check('fragmented interactive input', async () => {
			const start = primary.output.length;
			const ready = `INPUT_${randomBytes(8).toString('hex')}`;
			const result = primary.run(`printf '%s' ${quote(ready)}; IFS= read -r reply; printf '%s' "$reply"`);
			// Attach a rejection handler while waiting for the input prompt.
			result.catch(() => {});
			await primary.waitFor(new RegExp(ready), start);
			for (const chunk of ['hello ', 'café ', '日本語', '\n']) {
				primary.session.write(chunk);
				await delay(50, undefined, { signal: abort.signal });
			}
			assert.ok(await result === `${ready}hello café 日本語`, 'Fragmented input differed');
		});
		await check('256 KiB output integrity', async () => {
			const output = await primary.run("head -c 262144 /dev/zero | tr '\\000' x");
			assert.ok(output.length === 262144, 'Large output length differed');
			assert.ok(/^x+$/.test(output), 'Output corruption or unexpected bytes');
		});
		await check('terminal resizing', async () => {
			for (const [cols, rows] of [[80, 24], [132, 43], [120, 30]]) {
				primary.session.setSize(cols, rows);
				let size;
				// SSM resizes the host PTY; docker exec then propagates SIGWINCH
				// to the sandbox PTY asynchronously. Allow this to settle.
				const deadline = Date.now() + Math.min(opts.timeout * 1000, 10000);
				do {
					size = (await primary.run('stty size')).trim();
					if (size === `${rows} ${cols}`) break;
					await delay(200, undefined, { signal: abort.signal });
				} while (Date.now() < deadline);
				assert.ok(size === `${rows} ${cols}`, `Terminal size differed: requested ${rows} ${cols}, got ${/^\d+ \d+$/.test(size) ? size : 'non-numeric output'}`);
			}
		});
		await check('remote failure handling', async () => {
			await assert.rejects(primary.run('exit 7'), error => error.exitCode === 7);
			assert.ok(await primary.run('printf alive') === 'alive', 'Session stopped responding');
		});
		await check(`idle for ${opts.idle}s with keepalive`, async () => {
			const timer = setInterval(() => {
				try { primary.session.ping(); } catch (error) { primary.fail(error); }
			}, 30000);
			try { await delay(opts.idle * 1000, undefined, { signal: abort.signal }); }
			finally { clearInterval(timer); }
			assert.ok(await primary.run('printf alive') === 'alive', 'Session stopped responding');
		});
		if (!opts['skip-scp']) {
			for (const size of [0, 513, opts.bytes]) {
				await check(`SCP round trip ${size} bytes`, async () => {
					const data = randomBytes(size);
					const upload = path.join(local, `upload-${size}`);
					const download = path.join(local, `download-${size}`);
					const remoteFile = `${remote}/file-${size}`;
					await writeFile(upload, data);
					await scp(upload, `${opts.app}:${remoteFile}`);
					const hash = (await primary.run(`sha256sum ${quote(remoteFile)}`)).trim().split(/\s+/)[0];
					assert.ok(hash === digest(data), 'Uploaded file SHA-256 differs');
					await scp(`${opts.app}:${remoteFile}`, download);
					assert.ok((await readFile(download)).equals(data), 'Downloaded bytes differ');
				});
			}
		}
		await check('simultaneous sessions', async () => {
			const other = await connect();
			try {
				const outputs = await Promise.all([primary.run('printf first'), other.run('printf second')]);
				assert.ok(outputs[0] === 'first' && outputs[1] === 'second', 'Simultaneous session outputs differed');
			} finally { await other.close(); clients.delete(other); }
		});
		await check(`${opts.iterations} fresh sessions`, async () => {
			for (let i = 0; i < opts.iterations; i++) {
				const other = await connect();
				try { assert.ok(await other.run('printf fresh') === 'fresh', 'Fresh session did not respond'); }
				finally { await other.close(); clients.delete(other); }
			}
		});
		await check('remote exit and cleanup', async () => {
			await primary.run(`rm -rf -- ${quote(remote)}; test ! -e ${quote(remote)}`);
			directoryCreated = false;
			primary.session.write('exit\n');
			await primary.waitClosed();
		});
	} catch (error) {
		failed = true;
		console.error(`FAIL ${safe(error.message)}`);
		process.exitCode = abort.signal.aborted ? 130 : 1;
	} finally {
		if (directoryCreated) {
			try {
				// If the control channel failed, establish a fresh session for cleanup.
				if (primary?.error?.message === 'Interrupted' && !primary.disconnected) primary.error = undefined;
				const cleaner = primary && !primary.error ? primary : await connect(true);
				cleaner.timeoutMs = 10000;
				await cleaner.run(`rm -rf -- ${quote(remote)}; test ! -e ${quote(remote)}`);
				directoryCreated = false;
			} catch {
				console.error(`Cleanup could not be confirmed. Remove ${remote} from ${opts.app} manually.`);
				failed = true;
				process.exitCode ||= 1;
			}
		}
		for (const client of clients) {
			try { await client.close(); } catch (error) { console.error(safe(error.message)); failed = true; process.exitCode ||= 1; }
		}
		await rm(local, { recursive: true, force: true });
		process.off('SIGINT', interrupt);
		process.off('SIGTERM', interrupt);
		report.finished = new Date().toISOString();
		report.passed = !failed;
		report.cleanupConfirmed = !directoryCreated;
		if (opts.report) await writeFile(opts.report, JSON.stringify(report, null, 2) + '\n');
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
