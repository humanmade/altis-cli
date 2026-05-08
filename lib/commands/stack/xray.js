import fs from 'fs';
import readline from 'readline';
import { exec } from 'child_process';
import chalk from 'chalk';
import inquirer from 'inquirer';
import logUpdate from 'log-update';
import ora from 'ora';
import { getApp, fetchJSON, buildQuery, printJSON, printTable } from './util.js';
import Vantage from '../../vantage.js';

const SPARK = '▁▂▃▄▅▆▇█';
const QUIT = Symbol('quit');
const DASHBOARD_BASE = 'https://dashboard.altis-dxp.com';

const APP_INFO_TTL   = 24 * 60 * 60 * 1000; // 24 h — persisted to config.cache
const STATS_TTL      = 60 * 1000;            // 60 s  — session only
const GRAPH_TTL      = 2  * 60 * 1000;       // 2 min — session only

// Session-only caches (cleared on process exit).
const traceDetailCache = new Map();           // traceKey → data (immutable)
const statsCache       = new Map();           // cacheKey → { ts, data }
const graphCache       = new Map();           // cacheKey → { ts, data }

// ── Fetch helpers with caching ─────────────────────────────────────────────────

async function fetchNetworkSlug(v, app, config) {
	// 1. Persistent file cache (survives sessions).
	const fileKey = `xray_app_info_${app}`;
	if (config && config.cache) {
		const cached = config.cache.get(fileKey);
		if (cached && Date.now() < cached.ts + APP_INFO_TTL) return cached.slug;
	}
	try {
		const data = await fetchJSON(v, `stack/applications/${app}`);
		const slug = data['altis-instance'] || null;
		if (config && config.cache) {
			config.cache.set(fileKey, { ts: Date.now(), slug });
		}
		return slug;
	} catch {
		return null;
	}
}

async function fetchStatsWithCache(v, app, after, before) {
	const key = `${app}:${after}:${before}`;
	const cached = statsCache.get(key);
	if (cached && Date.now() < cached.ts + STATS_TTL) return cached.data;
	const data = await fetchJSON(v, `stack/applications/${app}/xray/statistics${buildQuery({ after, before })}`);
	statsCache.set(key, { ts: Date.now(), data });
	return data;
}

async function fetchGraphWithCache(v, app, after, before) {
	const key = `${app}:${after}:${before}`;
	const cached = graphCache.get(key);
	if (cached && Date.now() < cached.ts + GRAPH_TTL) return cached.data;
	const data = await fetchJSON(v, `stack/applications/${app}/xray/service-graph${buildQuery({ after, before })}`);
	graphCache.set(key, { ts: Date.now(), data });
	return data;
}

async function fetchTraceDetail(v, app, traceId) {
	const key = `${app}:${traceId}`;
	if (traceDetailCache.has(key)) return traceDetailCache.get(key);
	const data = await fetchJSON(v, `stack/applications/${app}/xray/traces/${encodeURIComponent(traceId)}`);
	traceDetailCache.set(key, data);
	return data;
}

function dashboardTraceUrl(networkSlug, app, traceId) {
	if (!networkSlug) return null;
	return `${DASHBOARD_BASE}/i/${networkSlug}/e/${app}/xray/trace/${traceId}/request`;
}

function openInBrowser(url) {
	const cmd = process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
	exec(cmd);
}

async function promptList(config) {
	const p = inquirer.prompt([{ type: 'list', ...config }]);
	const handler = (str) => {
		if (str === 'q') try { p.ui && p.ui.close(); } catch {}
	};
	process.stdin.on('keypress', handler);
	try {
		const answers = await p;
		const val = answers && answers[config.name];
		return val === undefined ? QUIT : val;
	} catch {
		return QUIT;
	} finally {
		process.stdin.off('keypress', handler);
	}
}

// ── Filter compiler ────────────────────────────────────────────────────────────

function compileFilter(argv) {
	const parts = [];
	if (argv.errors) parts.push('error');
	if (argv.faults) parts.push('fault OR http.status >= 500');
	if (argv.slow != null) parts.push(`responsetime >= ${argv.slow}`);
	if (argv.status) parts.push(`http.status ${argv.status}`);
	if (argv.responseTime) parts.push(`responsetime ${argv.responseTime}`);
	if (argv.urlContains) parts.push(`http.url CONTAINS "${argv.urlContains}"`);
	if (argv.method) parts.push(`http.method = "${argv.method.toUpperCase()}"`);
	if (argv.admin) parts.push('http.url CONTAINS "wp-admin"');
	if (argv.rest) parts.push('http.url CONTAINS "/wp-json/"');
	if (argv.filter) parts.push(argv.filter);
	return parts.join(' AND ');
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractNextToken(headers) {
	const link = headers.get('link') || headers.get('Link') || '';
	const m = link.match(/<[^>]*[?&]previous_token=([^&>]+)/);
	return m ? decodeURIComponent(m[1]) : null;
}


function formatDuration(s) {
	if (s == null || isNaN(s)) return '—';
	if (s >= 1) return `${s.toFixed(2)}s`;
	return `${Math.round(s * 1000)}ms`;
}

function statusColor(code) {
	if (!code) return chalk.grey;
	if (code >= 500) return chalk.red;
	if (code >= 400) return chalk.yellow;
	if (code >= 300) return chalk.cyan;
	return chalk.green;
}

function extractPath(url) {
	if (!url) return '—';
	try {
		const u = new URL(url);
		const qs = u.search.length > 31 ? u.search.slice(0, 30) + '…' : u.search;
		return u.pathname + qs;
	} catch {
		return url.slice(0, 60);
	}
}

function traceFlags(t) {
	const f = [];
	if (t.HasFault) f.push(chalk.red('fault'));
	if (t.HasError) f.push(chalk.yellow('error'));
	if (t.HasThrottle) f.push(chalk.magenta('throttle'));
	return f.join(' ') || chalk.green('ok');
}

function sparkline(values) {
	if (!values.length) return '';
	const max = Math.max(...values);
	if (max === 0) return SPARK[0].repeat(values.length);
	return values.map(v => SPARK[Math.round((v / max) * (SPARK.length - 1))]).join('');
}

function avg(values) {
	if (!values.length) return 0;
	return values.reduce((a, b) => a + b, 0) / values.length;
}

// ── Summary output ─────────────────────────────────────────────────────────────

function printSummaries(traces, app) {
	if (!traces.length) {
		console.log(chalk.grey('No traces found.'));
		return;
	}
	const rows = traces.map(t => {
		const http = t.Http || {};
		const status = http.HttpStatus;
		return {
			status: statusColor(status)(String(status || '—')),
			method: http.HttpMethod || '—',
			path: extractPath(http.HttpURL).slice(0, 50),
			response: formatDuration(t.ResponseTime),
			total: formatDuration(t.Duration),
			flags: traceFlags(t),
			id: chalk.dim(t.Id || '—'),
		};
	});
	printTable(rows);
	console.log(chalk.dim(`\nInspect a trace: altis-cli stack xray ${app} --trace <id>`));
}

function printGrouped(traces, groupBy) {
	const groups = {};
	for (const t of traces) {
		const http = t.Http || {};
		let key;
		switch (groupBy) {
			case 'url':       key = extractPath(http.HttpURL); break;
			case 'status':    key = String(http.HttpStatus || '—'); break;
			case 'method':    key = http.HttpMethod || '—'; break;
			case 'client-ip': key = http.ClientIp || '—'; break;
			default:          key = '—';
		}
		if (!groups[key]) groups[key] = { count: 0, errors: 0, faults: 0, totalDuration: 0 };
		groups[key].count++;
		if (t.HasError) groups[key].errors++;
		if (t.HasFault) groups[key].faults++;
		groups[key].totalDuration += t.Duration || 0;
	}
	const rows = Object.entries(groups)
		.sort((a, b) => b[1].count - a[1].count)
		.map(([key, g]) => ({
			[groupBy]: key.slice(0, 50),
			count: String(g.count),
			'avg duration': formatDuration(g.totalDuration / g.count),
			errors: g.errors ? chalk.yellow(String(g.errors)) : '0',
			faults: g.faults ? chalk.red(String(g.faults)) : '0',
		}));
	printTable(rows);
}

// ── Trace detail output ────────────────────────────────────────────────────────

function flattenSubsegments(node, results = []) {
	const { name = '', start_time, end_time, sql, http, fault, error, cause, annotations, subsegments } = node;
	const duration = (end_time != null && start_time != null) ? end_time - start_time : null;
	results.push({ name, duration, sql, http, fault, error, cause, annotations });
	if (subsegments) {
		for (const sub of subsegments) {
			flattenSubsegments(sub, results);
		}
	}
	return results;
}

// Convert $_SERVER keys to [headerName, value] pairs suitable for display.
function serverToHeaders(srv) {
	const SKIP = new Set([
		'REQUEST_METHOD', 'REQUEST_URI', 'REQUEST_TIME', 'REQUEST_TIME_FLOAT',
		'PHP_SELF', 'QUERY_STRING', 'HTTPS', 'SERVER_ADDR', 'REMOTE_ADDR',
	]);
	const result = [];
	for (const [key, value] of Object.entries(srv)) {
		if (SKIP.has(key) || value == null || value === '') continue;
		let name;
		if (key.startsWith('HTTP_')) {
			name = key.slice(5).split('_').map(p => p[0].toUpperCase() + p.slice(1).toLowerCase()).join('-');
		} else if (key === 'CONTENT_TYPE') {
			name = 'Content-Type';
		} else if (key === 'CONTENT_LENGTH') {
			name = 'Content-Length';
		} else {
			continue;
		}
		result.push([name, String(value)]);
	}
	return result.sort((a, b) => a[0].localeCompare(b[0]));
}

function printTraceCompact(trace) {
	const docs = (trace.Segments || []).map(s => s.Document).filter(Boolean);
	const root = docs.find(d => d.http && d.http.request) || docs[0];
	if (!root) { console.log(chalk.yellow('No segment data available.')); return; }

	const req      = root.http && root.http.request;
	const res      = root.http && root.http.response;
	const status   = res && res.status;
	const dur      = trace.Duration || (root.end_time - root.start_time);
	const ann      = root.annotations || {};
	const mem      = ann.memoryUsage;
	const fpmQ     = ann.fpmQueueTime;
	const meta_    = root.metadata || {};
	const srv      = meta_['$_SERVER'] || {};
	const stats    = meta_.stats || {};
	const oc       = stats.object_cache || {};
	const cpu      = stats.cpu || {};
	const dbStats  = stats.db || {};
	const clientIp = srv.REMOTE_ADDR;
	const reqTime  = srv.REQUEST_TIME ? new Date(srv.REQUEST_TIME * 1000) : null;

	const allSegs = [];
	for (const doc of docs) {
		if (doc.subsegments) for (const sub of doc.subsegments) flattenSubsegments(sub, allSegs);
	}
	const sqlSegs    = allSegs.filter(s => s.sql);
	const remoteSegs = allSegs.filter(s => s.http && !s.sql);

	const dbDur    = (dbStats.time != null ? dbStats.time : null) ?? sqlSegs.reduce((t, s) => t + (s.duration || 0), 0);
	const cacheDur = oc.time ?? 0;
	const httpDur  = remoteSegs.reduce((t, s) => t + (s.duration || 0), 0);
	const phpDur   = Math.max(0, (dur || 0) - dbDur - cacheDur - httpDur);
	const totalDur = Math.max(dur || 0, dbDur + cacheDur + httpDur + phpDur, 0.001);

	const BAR = 30;
	const b = d => Math.max(0, Math.round((d / totalDur) * BAR));
	const bar =
		chalk.green('█'.repeat(b(phpDur))) +
		chalk.cyan('█'.repeat(b(dbDur))) +
		chalk.blue('█'.repeat(b(cacheDur))) +
		(b(httpDur) ? chalk.magenta('█'.repeat(b(httpDur))) : '') +
		chalk.dim('░'.repeat(Math.max(0, BAR - b(phpDur) - b(dbDur) - b(cacheDur) - b(httpDur))));
	const legend = [
		phpDur   > 0.001 ? chalk.green('php')   + ' ' + chalk.dim(formatDuration(phpDur))   : null,
		dbDur    > 0     ? chalk.cyan('db')      + ' ' + chalk.dim(formatDuration(dbDur))    : null,
		cacheDur > 0     ? chalk.blue('cache')   + ' ' + chalk.dim(formatDuration(cacheDur)) : null,
		httpDur  > 0     ? chalk.magenta('http') + ' ' + chalk.dim(formatDuration(httpDur))  : null,
	].filter(Boolean).join('  ');

	const flags = [
		root.fault    && chalk.red('fault'),
		root.error    && chalk.yellow('error'),
		root.throttle && chalk.magenta('throttle'),
	].filter(Boolean);

	// Collect first exception
	const exceptions = [];
	const seenIds = new Set();
	const collectEx = node => {
		if (node.cause && Array.isArray(node.cause.exceptions)) {
			for (const ex of node.cause.exceptions) {
				if (!seenIds.has(ex.id)) { seenIds.add(ex.id); exceptions.push(ex); }
			}
		}
	};
	for (const doc of docs) collectEx(doc);
	for (const seg of allSegs) collectEx(seg);

	console.log('');
	console.log(statusColor(status)(String(status || '—')) + '  ' + chalk.bold(`${(req && req.method) || '—'} ${extractPath(req && req.url)}`));

	const metaParts = [formatDuration(dur)];
	if (mem != null) metaParts.push(`${parseFloat(mem).toFixed(1)}MB`);
	if (sqlSegs.length) metaParts.push(`${sqlSegs.length} ${sqlSegs.length === 1 ? 'query' : 'queries'}`);
	if (remoteSegs.length) metaParts.push(`${remoteSegs.length} remote`);
	if (reqTime) metaParts.push(reqTime.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }));
	if (clientIp) metaParts.push(clientIp);
	if (flags.length) metaParts.push(...flags);
	console.log(chalk.dim(metaParts.join('  ·  ')));

	console.log(bar + '  ' + legend);

	const ocTotal = (oc.hits || 0) + (oc.misses || 0);
	if (ocTotal > 0) {
		const hitRate = ocTotal ? Math.round((oc.hits / ocTotal) * 100) : 0;
		const hitColor = hitRate >= 90 ? chalk.green : hitRate >= 70 ? chalk.yellow : chalk.red;
		const phpLine = [
			cpu.total_time && `php ${formatDuration(cpu.total_time)}`,
			fpmQ > 0.001   && `fpm queue ${formatDuration(fpmQ)}`,
		].filter(Boolean).join('  ·  ');
		if (phpLine) console.log(chalk.dim(phpLine));
		console.log(chalk.dim(`cache  ${ocTotal} calls  `) + hitColor(`${oc.hits} hits (${hitRate}%)`) + chalk.dim(`  ${oc.misses} misses`));
	}

	if (exceptions.length) {
		const ex = exceptions[0];
		const msg = ex.message ? `: ${ex.message}` : '';
		console.log(chalk.red(`${ex.type || 'Exception'}`) + chalk.dim(msg) + (exceptions.length > 1 ? chalk.dim(` (+${exceptions.length - 1} more)`) : ''));
	}
	console.log('');
}

function printTraceDetail(trace) {
	const docs = (trace.Segments || []).map(s => s.Document).filter(Boolean);
	const root = docs.find(d => d.http && d.http.request) || docs[0];
	if (!root) { console.log(chalk.yellow('No segment data available.')); return; }

	const req      = root.http && root.http.request;
	const res      = root.http && root.http.response;
	const status   = res && res.status;
	const dur      = trace.Duration || (root.end_time - root.start_time);
	const ann      = root.annotations || {};
	const mem      = ann.memoryUsage;
	const fpmQ     = ann.fpmQueueTime;
	const meta_    = root.metadata || {};
	const srv      = meta_['$_SERVER'] || {};
	const stats    = meta_.stats || {};
	const oc       = stats.object_cache || {};
	const cpu      = stats.cpu || {};
	const dbStats  = stats.db || {};
	const clientIp = srv.REMOTE_ADDR;
	const reqTime  = srv.REQUEST_TIME ? new Date(srv.REQUEST_TIME * 1000) : null;
	const respHeaders = (meta_.response && meta_.response.headers) || [];

	const allSegs = [];
	for (const doc of docs) {
		if (doc.subsegments) for (const sub of doc.subsegments) flattenSubsegments(sub, allSegs);
	}
	const sqlSegs    = allSegs.filter(s => s.sql);
	const remoteSegs = allSegs.filter(s => s.http && !s.sql);

	const dbDur    = (dbStats.time != null ? dbStats.time : null) ?? sqlSegs.reduce((t, s) => t + (s.duration || 0), 0);
	const cacheDur = oc.time ?? 0;
	const httpDur  = remoteSegs.reduce((t, s) => t + (s.duration || 0), 0);
	const phpDur   = Math.max(0, (dur || 0) - dbDur - cacheDur - httpDur);
	const totalDur = Math.max(dur || 0, dbDur + cacheDur + httpDur + phpDur, 0.001);

	// ── Header ────────────────────────────────────────────────────────────────
	console.log('');
	console.log(
		statusColor(status)(String(status || '—')) + '  ' +
		chalk.bold(`${(req && req.method) || '—'} ${(req && req.url) || '—'}`)
	);
	console.log('');

	// ── Summary ───────────────────────────────────────────────────────────────
	const L = 16;
	const kv = (k, v) => chalk.dim(k.padEnd(L)) + chalk.white(String(v));
	const row2 = (left, right) => left + (right ? '    ' + right : '');

	console.log(row2(kv('Duration', formatDuration(dur)), kv('Trace ID', chalk.dim(trace.Id || '—'))));
	if (mem != null) console.log(row2(kv('Memory', `${parseFloat(mem).toFixed(2)}MB`), reqTime ? kv('Request Time', reqTime.toLocaleString()) : ''));
	console.log(row2(kv('Queries', sqlSegs.length), clientIp ? kv('Client IP', clientIp) : ''));
	if (remoteSegs.length) console.log(kv('Remote Requests', remoteSegs.length));
	const flags = [
		root.fault    && chalk.red('fault'),
		root.error    && chalk.yellow('error'),
		root.throttle && chalk.magenta('throttle'),
	].filter(Boolean);
	if (flags.length) console.log(kv('Flags', flags.join('  ')));
	console.log('');

	// ── Bar graph ─────────────────────────────────────────────────────────────
	const BAR = 36;
	const b = d => Math.max(0, Math.round((d / totalDur) * BAR));
	const bar =
		chalk.green('█'.repeat(b(phpDur))) +
		chalk.cyan('█'.repeat(b(dbDur))) +
		chalk.blue('█'.repeat(b(cacheDur))) +
		(b(httpDur) ? chalk.magenta('█'.repeat(b(httpDur))) : '') +
		chalk.dim('░'.repeat(Math.max(0, BAR - b(phpDur) - b(dbDur) - b(cacheDur) - b(httpDur))));
	const legend = [
		phpDur   > 0.001 ? chalk.green('php')   + ' ' + chalk.dim(formatDuration(phpDur))   : null,
		dbDur    > 0     ? chalk.cyan('db')      + ' ' + chalk.dim(formatDuration(dbDur))    : null,
		cacheDur > 0     ? chalk.blue('cache')   + ' ' + chalk.dim(formatDuration(cacheDur)) : null,
		httpDur  > 0     ? chalk.magenta('http') + ' ' + chalk.dim(formatDuration(httpDur))  : null,
	].filter(Boolean).join('  ');
	console.log(bar + '  ' + legend);
	console.log('');

	// ── Timing detail ─────────────────────────────────────────────────────────
	const T = 18;
	const tr = (label, val) => chalk.dim(label.padEnd(T)) + val;
	console.log(tr('Total Wall', formatDuration(dur)));
	if (fpmQ > 0)        console.log(tr('PHP-FPM Queue', formatDuration(fpmQ)));
	if (cpu.total_time)  console.log(tr('PHP', `${formatDuration(cpu.total_time)}  ${chalk.dim(`sys ${formatDuration(cpu.sys_time)}  user ${formatDuration(cpu.user_time)}`)}`));
	if (dbDur > 0)       console.log(tr('Database', formatDuration(dbDur)));
	const ocTotal = (oc.hits || 0) + (oc.misses || 0);
	if (ocTotal > 0) {
		const hitRate = ocTotal ? Math.round((oc.hits / ocTotal) * 100) : 0;
		const hitColor = hitRate >= 90 ? chalk.green : hitRate >= 70 ? chalk.yellow : chalk.red;
		console.log(tr('Object Cache', `${formatDuration(oc.time)}  ${chalk.dim(`${ocTotal} calls`)}  ${hitColor(`${oc.hits} hits (${hitRate}%)`)}  ${chalk.dim(`${oc.misses} misses`)}`));
	}
	console.log('');

	// ── Errors ────────────────────────────────────────────────────────────────
	const exceptions = [];
	const seenIds = new Set();
	const collectEx = node => {
		if (node.cause && Array.isArray(node.cause.exceptions)) {
			for (const ex of node.cause.exceptions) {
				if (!seenIds.has(ex.id)) { seenIds.add(ex.id); exceptions.push(ex); }
			}
		}
	};
	for (const doc of docs) collectEx(doc);
	for (const seg of allSegs) collectEx(seg);
	if (exceptions.length) {
		console.log(chalk.bold(`Errors (${exceptions.length})`));
		for (const ex of exceptions.slice(0, 5)) {
			const msg = ex.message ? `: ${ex.message}` : '';
			console.log(chalk.red(`  ${ex.type || 'Exception'}`) + chalk.dim(msg));
			if (ex.stack && ex.stack.length) {
				for (const frame of ex.stack.slice(0, 3)) {
					console.log(chalk.dim(`    ${frame.path || ''}:${frame.line || ''}`));
				}
			}
		}
		if (exceptions.length > 5) console.log(chalk.dim(`  … and ${exceptions.length - 5} more`));
		console.log('');
	}

	// ── Request Headers ───────────────────────────────────────────────────────
	const reqHeaders = serverToHeaders(srv);
	if (reqHeaders.length) {
		console.log(chalk.bold('Request Headers'));
		const pad = Math.min(32, Math.max(...reqHeaders.map(([k]) => k.length))) + 2;
		for (const [k, v] of reqHeaders) {
			const val = k === 'Cookie' ? v.slice(0, 80) + (v.length > 80 ? '…' : '') : v;
			console.log(chalk.dim(k.padEnd(pad)) + val);
		}
		console.log('');
	}

	// ── Response Headers ──────────────────────────────────────────────────────
	if (respHeaders.length) {
		console.log(chalk.bold('Response Headers'));
		const parsed = respHeaders.map(h => {
			const i = h.indexOf(': ');
			return i > 0 ? [h.slice(0, i), h.slice(i + 2)] : [h, ''];
		});
		const pad = Math.min(32, Math.max(...parsed.map(([k]) => k.length))) + 2;
		for (const [k, v] of parsed) {
			console.log(chalk.dim(k.padEnd(pad)) + v);
		}
		console.log('');
	}
}

// ── Service graph output ───────────────────────────────────────────────────────

function printServiceGraph(graph) {
	if (!graph || !graph.Edges || !graph.Edges.length) {
		console.log(chalk.grey('No downstream services.'));
		return;
	}
	const rows = graph.Edges.map(edge => {
		const svc = edge.Service || {};
		const stats = edge.SummaryStatistics || {};
		const total = stats.TotalCount || 0;
		const avgLatency = total && stats.TotalResponseTime ? stats.TotalResponseTime / total : 0;
		const faults = (stats.FaultStatistics && stats.FaultStatistics.TotalCount) || 0;
		const errors = (stats.ErrorStatistics && stats.ErrorStatistics.TotalCount) || 0;
		return {
			service: svc.Name || '—',
			calls: String(total),
			'avg latency': formatDuration(avgLatency),
			faults: faults ? chalk.red(String(faults)) : '0',
			errors: errors ? chalk.yellow(String(errors)) : '0',
		};
	});
	console.log(`\n${chalk.bold(graph.Name)} → downstream services:\n`);
	printTable(rows);
}

// ── Statistics output ──────────────────────────────────────────────────────────

function printStats(stats) {
	if (!stats.length) {
		console.log(chalk.grey('No statistics available.'));
		return;
	}

	// Stats come newest-first; reverse so sparklines read left (oldest) to right (newest)
	const sorted = [...stats].reverse();
	const MAX_SPARK = 40;
	const step = sorted.length > MAX_SPARK ? Math.ceil(sorted.length / MAX_SPARK) : 1;
	const sample = sorted.filter((_, i) => i % step === 0);

	const periodMins  = sorted.length > 0 ? Math.max(1, (sorted[0].time_end - sorted[0].time) / 60) : 1;
	const requests    = sample.map(s => (s.requests || 0) / periodMins);
	const latency     = sample.map(s => (s.latency || 0) * 1000);
	const dbLatency   = sample.map(s => (s.db_latency || 0) * 1000);
	const dbRepLatency = sample.map(s => (s.db_replica_latency || 0) * 1000);
	const cacheLatency = sample.map(s => (s.cache_latency || 0) * 1000);
	const errorRate   = sample.map(s => s.error_rate || 0);
	const faultRate   = sample.map(s => s.fault_rate || 0);
	const apdexVals   = sample.map(s => typeof s.apdex === 'object' ? (s.apdex.value || 0) : (s.apdex || 0));

	const totalRequests = stats.reduce((t, s) => t + (s.requests || 0), 0);
	const totalErrors   = stats.reduce((t, s) => t + (s.errors || 0), 0);
	const totalFaults   = stats.reduce((t, s) => t + (s.faults || 0), 0);
	const avgRpm        = totalRequests / (stats.length * periodMins);

	const startTime = new Date(sorted[0].time * 1000).toLocaleTimeString();
	const endTime   = new Date(sorted[sorted.length - 1].time_end * 1000).toLocaleTimeString();

	console.log('');
	console.log(chalk.dim(`${startTime} → ${endTime}  (${stats.length} period${stats.length === 1 ? '' : 's'})`));
	console.log('');

	const row = (label, spark, summary) =>
		`${chalk.blue(label.padEnd(14))}  ${chalk.grey(spark.padEnd(MAX_SPARK))}  ${summary}`;

	console.log(row('Requests',    sparkline(requests),    `avg ${avgRpm.toFixed(1)}/min  ${totalRequests} total`));
	console.log(row('Apdex',       sparkline(apdexVals),   `avg ${avg(apdexVals).toFixed(2)}`));
	console.log(row('Response Time', sparkline(latency),   `avg ${formatDuration(avg(latency) / 1000)}  max ${formatDuration(Math.max(...latency) / 1000)}`));
	console.log(row('DB',          sparkline(dbLatency),   `avg ${formatDuration(avg(dbLatency) / 1000)}`));
	if (stats.some(s => s.db_replica_latency > 0)) {
		console.log(row('DB Replica',  sparkline(dbRepLatency), `avg ${formatDuration(avg(dbRepLatency) / 1000)}`));
	}
	console.log(row('Cache',       sparkline(cacheLatency),`avg ${formatDuration(avg(cacheLatency) / 1000)}`));
	console.log(row('Errors',      sparkline(errorRate),   `${totalErrors} total  rate ${(avg(errorRate) * 100).toFixed(1)}%`));
	console.log(row('Faults',      sparkline(faultRate),   `${totalFaults} total  rate ${(avg(faultRate) * 100).toFixed(1)}%`));
	console.log('');
}

// ── Fetch helpers ──────────────────────────────────────────────────────────────

function timeParams(argv) {
	return {
		after:  argv.after  || '15 minutes ago',
		before: argv.before || 'now',
	};
}

async function fetchSummaries(v, app, argv) {
	const filter = compileFilter(argv);
	if (argv.debug && filter) {
		console.error(chalk.dim(`Filter: ${filter}`));
	}
	const params = {
		...timeParams(argv),
		filter:         filter || undefined,
		previous_token: argv.nextToken || undefined,
	};
	const url = `stack/applications/${app}/xray/traces/summaries${buildQuery(params)}`;
	const resp = await v.fetch(url);
	if (!resp.ok) {
		const data = await resp.json().catch(() => ({}));
		throw new Error(data.message || resp.statusText);
	}
	const traces = await resp.json();
	const nextToken = extractNextToken(resp.headers);
	return { traces, nextToken };
}

// ── Subcommand handlers ────────────────────────────────────────────────────────

async function summaryHandler(argv) {
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const spinner = ora('Fetching traces…').start();
	let result;
	try {
		result = await fetchSummaries(v, app, argv);
		spinner.stop();
	} catch (err) {
		spinner.stop();
		throw err;
	}
	const { traces, nextToken } = result;
	if (argv.json) {
		if (argv.output) {
			fs.writeFileSync(argv.output, JSON.stringify(traces, null, 2));
			console.log(chalk.green(`Wrote ${argv.output}`));
			return;
		}
		printJSON(traces);
		return;
	}
	if (argv.groupBy) {
		printGrouped(traces, argv.groupBy);
	} else {
		printSummaries(traces, app);
	}
	if (nextToken) {
		console.log(chalk.dim(`\nNext page: --next-token ${nextToken}`));
	}
}

async function traceHandler(argv) {
	const id = argv.id;
	const resolvedApp = await getApp(argv);
	const v = new Vantage(argv.config);
	const spinner = ora('Fetching trace…').start();
	let data;
	try {
		data = await fetchTraceDetail(v, resolvedApp, id);
		spinner.stop();
	} catch (err) {
		spinner.stop();
		throw err;
	}
	if (argv.json) {
		if (argv.output) {
			fs.writeFileSync(argv.output, JSON.stringify(data, null, 2));
			console.log(chalk.green(`Wrote ${argv.output}`));
			return;
		}
		printJSON(data);
		return;
	}
	printTraceCompact(data);

	const networkSlug = await fetchNetworkSlug(v, resolvedApp, argv.config);
	const dashUrl = dashboardTraceUrl(networkSlug, resolvedApp, id);

	while (true) {
		const followUps = [
			{ name: 'Show request details', value: 'details' },
			{ name: 'View in Altis Dashboard ↗', value: 'dashboard' },
			{ name: 'Export JSON', value: 'json' },
			{ name: chalk.dim('Quit'), value: 'quit' },
		];

		const action = await promptList({
			name: 'action',
			message: chalk.dim(id),
			choices: followUps,
		});

		if (action === QUIT || action === 'quit') break;
		if (action === 'details') { printTraceDetail(data); continue; }
		if (action === 'dashboard') {
			if (dashUrl) {
				openInBrowser(dashUrl);
			} else {
				console.log(chalk.dim(`${DASHBOARD_BASE}/i/<instance>/e/${resolvedApp}/xray/trace/${id}/request`));
			}
			continue;
		}
		if (action === 'json') {
			const { filename } = await inquirer.prompt([{
				type: 'input',
				name: 'filename',
				message: 'Output filename:',
				default: `trace-${id}.json`,
			}]);
			fs.writeFileSync(filename, JSON.stringify(data, null, 2));
			console.log(chalk.green(`Wrote ${filename}`));
			continue;
		}
	}
}

async function traceFileHandler(argv) {
	const filePath = argv.path;
	let data;
	try {
		data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
	} catch (err) {
		console.error(chalk.red(`Could not read ${filePath}: ${err.message}`));
		process.exit(1);
	}

	const traceId = data.Id;
	const docs = (data.Segments || []).map(s => s.Document).filter(Boolean);
	const app = argv.stack || (docs[0] && docs[0].name) || null;
	const v = new Vantage(argv.config);

	printTraceCompact(data);
	console.log(chalk.dim(`  ${filePath}`));

	while (true) {
		const networkSlug = app ? await fetchNetworkSlug(v, app, argv.config) : null;
		const dashUrl = traceId && app ? dashboardTraceUrl(networkSlug, app, traceId) : null;

		const followUps = [
			{ name: 'Show request details', value: 'details' },
		];
		if (dashUrl) followUps.push({ name: 'View in Altis Dashboard ↗', value: 'dashboard' });
		followUps.push({ name: chalk.dim('Quit'), value: 'quit' });

		const action = await promptList({
			name: 'action',
			message: chalk.dim(traceId || filePath),
			choices: followUps,
		});

		if (action === QUIT || action === 'quit') break;
		if (action === 'details') { printTraceDetail(data); continue; }
		if (action === 'dashboard') { openInBrowser(dashUrl); continue; }
	}
}

async function graphHandler(argv) {
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const spinner = ora('Fetching service graph…').start();
	let data;
	try {
		data = await fetchGraphWithCache(v, app, timeParams(argv).after, timeParams(argv).before);
		spinner.stop();
	} catch (err) {
		spinner.stop();
		if (err.code === 'upstream-xray-error') {
			console.log(chalk.yellow('Service graph is not available for this application.'));
			if (argv.debug) console.error(chalk.dim(err.message));
			return;
		}
		throw err;
	}
	if (argv.json) {
		if (argv.output) {
			fs.writeFileSync(argv.output, JSON.stringify(data, null, 2));
			console.log(chalk.green(`Wrote ${argv.output}`));
			return;
		}
		printJSON(data);
		return;
	}
	printServiceGraph(data);
}

async function statsHandler(argv) {
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const spinner = ora('Fetching statistics…').start();
	let data;
	try {
		data = await fetchStatsWithCache(v, app, timeParams(argv).after, timeParams(argv).before);
		spinner.stop();
	} catch (err) {
		spinner.stop();
		throw err;
	}
	if (argv.json) {
		if (argv.output) {
			fs.writeFileSync(argv.output, JSON.stringify(data, null, 2));
			console.log(chalk.green(`Wrote ${argv.output}`));
			return;
		}
		printJSON(data);
		return;
	}
	printStats(data);
}

// ── Interactive trace browser ──────────────────────────────────────────────────

async function pickAndInspectTrace(v, app, argv, filterOpts = {}, preloaded = null) {
	let traces = preloaded;
	if (!traces) {
		const spinner = ora('Fetching traces…').start();
		try {
			({ traces } = await fetchSummaries(v, app, { ...argv, ...filterOpts }));
			spinner.stop();
		} catch (err) {
			spinner.stop();
			console.error(chalk.red(err.message));
			return;
		}
	}

	if (!traces.length) {
		console.log(chalk.grey('No traces found.'));
		return;
	}

	const choices = traces.map(t => {
		const http = t.Http || {};
		const status = http.HttpStatus;
		return {
			name: [
				statusColor(status)(String(status || '—').padEnd(3)),
				(http.HttpMethod || '—').padEnd(5),
				extractPath(http.HttpURL).slice(0, 42).padEnd(44),
				formatDuration(t.ResponseTime).padEnd(9),
				formatDuration(t.Duration).padEnd(9),
				traceFlags(t),
			].join('  '),
			value: t,
			short: t.Id,
		};
	});
	choices.push({ name: chalk.dim('← Back'), value: null });

	while (true) {
		const selected = await promptList({
			name: 'selected',
			message: 'Select trace:',
			choices,
			pageSize: 15,
		});
		if (!selected || selected === QUIT) break;

		const cached = traceDetailCache.has(`${app}:${selected.Id}`);
		const spinner2 = cached ? null : ora('Fetching trace detail…').start();
		let traceData;
		try {
			traceData = await fetchTraceDetail(v, app, selected.Id);
			spinner2 && spinner2.stop();
		} catch (err) {
			spinner2 && spinner2.stop();
			console.error(chalk.red(err.message));
			continue;
		}

		printTraceCompact(traceData);
		console.log(chalk.dim(`  altis-cli stack xray ${app} --trace ${selected.Id}`));

		const http = selected.Http || {};
		const networkSlug = await fetchNetworkSlug(v, app, argv.config);
		const dashUrl = dashboardTraceUrl(networkSlug, app, selected.Id);

		const followUps = [
			{ name: 'Show request details', value: 'details' },
			{ name: 'Inspect another trace', value: 'another' },
		];
		if (http.HttpURL) {
			const path = extractPath(http.HttpURL);
			followUps.push({ name: `Narrow by URL: ${path.slice(0, 40)}`, value: 'url' });
		}
		if (http.HttpStatus) {
			followUps.push({ name: `Narrow by status: ${http.HttpStatus}`, value: 'status' });
		}
		followUps.push({ name: 'View in Altis Dashboard ↗', value: 'dashboard' });
		followUps.push(
			{ name: 'Export trace JSON', value: 'json' },
			{ name: chalk.dim('← Back to main menu'), value: 'back' },
		);

		let leaveTraceList = false;
		while (true) {
			const followUp = await promptList({
				name: 'followUp',
				message: chalk.dim(selected.Id),
				choices: followUps,
			});

			if (followUp === QUIT || followUp === 'back') { leaveTraceList = true; break; }
			if (followUp === 'another') break;
			if (followUp === 'details') { printTraceDetail(traceData); continue; }
			if (followUp === 'dashboard') {
				if (dashUrl) {
					openInBrowser(dashUrl);
				} else {
					console.log(chalk.yellow(`Could not resolve instance slug for ${app}.`));
					console.log(chalk.dim(`${DASHBOARD_BASE}/i/<instance>/e/${app}/xray/trace/${selected.Id}/request`));
				}
				continue;
			}
			if (followUp === 'json') {
				const { filename } = await inquirer.prompt([{
					type: 'input',
					name: 'filename',
					message: 'Output filename:',
					default: `trace-${selected.Id}.json`,
				}]);
				fs.writeFileSync(filename, JSON.stringify(traceData, null, 2));
				console.log(chalk.green(`Wrote ${filename}`));
				continue;
			}
			if (followUp === 'url') {
				await pickAndInspectTrace(v, app, argv, { ...filterOpts, urlContains: extractPath(http.HttpURL) });
				leaveTraceList = true;
				break;
			}
			if (followUp === 'status') {
				await pickAndInspectTrace(v, app, argv, { ...filterOpts, status: `= ${http.HttpStatus}` });
				leaveTraceList = true;
				break;
			}
		}

		if (leaveTraceList) break;
	}
}

async function traceBrowserHandler(argv, preloaded = null) {
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const after  = argv.after  || '15 minutes ago';
	const before = argv.before || 'now';

	let allTraces = preloaded ? preloaded.traces : null;

	if (!preloaded) {
		const spinner = ora(`Loading ${app}…`).start();
		let tracesError = null;
		await fetchSummaries(v, app, { ...argv, after, before })
			.then(({ traces }) => { allTraces = traces; })
			.catch(err => { tracesError = err; });

		if (allTraces) {
			spinner.succeed(`Loaded ${allTraces.length} trace${allTraces.length === 1 ? '' : 's'}.`);
		} else {
			spinner.fail(`Could not load traces for ${app}.`);
			if (argv.debug && tracesError) console.error(chalk.dim(tracesError.message));
			return;
		}
	}

	// Client-side partitions derived from the prefetched set.
	const slowTraces  = allTraces ? allTraces.filter(t => (t.Duration || 0) >= 2 || (t.ResponseTime || 0) >= 2) : null;
	const errorTraces = allTraces ? allTraces.filter(t => t.HasError || t.HasThrottle) : null;
	const faultTraces = allTraces ? allTraces.filter(t => t.HasFault || ((t.Http || {}).HttpStatus || 0) >= 500) : null;

	const label = (name, subset) => {
		const count = subset ? subset.length : 0;
		const color = count > 0 ? chalk.yellow : chalk.dim;
		return `${name} ${color(`(${count})`)}`;
	};

	while (true) {
		const action = await promptList({
			name: 'action',
			message: `${chalk.bold(app)}  ${chalk.dim(`${after} → ${before}`)}`,
			choices: [
				{ name: label('Recent traces',         allTraces),   value: 'all' },
				{ name: label('Errors',                errorTraces), value: 'errors' },
				{ name: label('Faults / 5xx',          faultTraces), value: 'faults' },
				{ name: label('Slow traces >=2s',      slowTraces),  value: 'slow' },
				{ name: 'Filter traces',                value: 'filter' },
				{ name: 'Export summaries JSON',        value: 'export' },
				{ name: chalk.dim('Quit'),              value: 'quit' },
			],
		});

		if (action === QUIT || action === 'quit') break;

		if (action === 'all') {
			await pickAndInspectTrace(v, app, { ...argv, after, before }, {}, allTraces);
			continue;
		}

		if (action === 'slow') {
			await pickAndInspectTrace(v, app, { ...argv, after, before }, { slow: 2 }, slowTraces);
			continue;
		}

		if (action === 'errors') {
			await pickAndInspectTrace(v, app, { ...argv, after, before }, { filter: 'error' }, errorTraces);
			continue;
		}

		if (action === 'faults') {
			await pickAndInspectTrace(v, app, { ...argv, after, before }, { faults: true }, faultTraces);
			continue;
		}

		if (action === 'filter') {
			const { expr } = await inquirer.prompt([{
				type: 'input',
				name: 'expr',
				message: 'X-Ray filter expression (blank for none):',
			}]);
			await pickAndInspectTrace(v, app, { ...argv, after, before }, { filter: expr.trim() || undefined });
			continue;
		}

		if (action === 'export') {
			const { filename } = await inquirer.prompt([{
				type: 'input',
				name: 'filename',
				message: 'Output filename:',
				default: `xray-${app}-${Date.now()}.json`,
			}]);
			const traces = allTraces || [];
			fs.writeFileSync(filename, JSON.stringify(traces, null, 2));
			console.log(chalk.green(`Wrote ${traces.length} traces to ${filename}`));
			continue;
		}
	}
}

// ── Watch (live auto-refresh) ──────────────────────────────────────────────────

async function watchHandler(argv) {
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const after  = argv.after  || '1 hour ago';
	const before = argv.before || 'now';
	let interval = Number(argv.interval) || 30;

	let stats = [];
	let allTraces = null;
	let lastFetched = null;
	let fetchError = null;
	let refreshTimer = null;
	let busy = false;
	let menuIndex = 0;

	const MENU = [
		{ label: 'Recent traces',     action: 'recent' },
		{ label: 'Slow traces >=2s',  action: 'slow' },
		{ label: 'Errors',            action: 'errors' },
		{ label: 'Faults / 5xx',      action: 'faults' },
		{ label: 'Export JSON',       action: 'export' },
	];

	const sparkWidth = () => Math.max(10, Math.min(60, (process.stdout.columns || 80) - 36));

	function sampleForSpark(sorted) {
		const N = sparkWidth();
		const step = sorted.length > N ? Math.ceil(sorted.length / N) : 1;
		const raw = sorted.filter((_, i) => i % step === 0);
		if (raw[raw.length - 1] !== sorted[sorted.length - 1]) raw.push(sorted[sorted.length - 1]);
		return raw.slice(-N);
	}

	function render() {
		const intervalLabel = chalk.dim(`↻ ${interval}s`);
		const fetchedLabel  = lastFetched ? chalk.dim(`  ${lastFetched}`) : '';
		const errorLabel    = fetchError  ? chalk.red(`  ${fetchError.slice(0, 60)}`) : '';
		let rangeLabel = chalk.dim(`${after} → ${before}`);

		if (!stats.length) {
			const header = `${chalk.bold.cyan('X-Ray Stats')}  ${chalk.white(app)}\n${rangeLabel}  ${intervalLabel}${fetchedLabel}${errorLabel}`;
			logUpdate(`${header}\n\n${chalk.dim('Fetching…')}`);
			return;
		}

		const sorted = [...stats].reverse();
		const sample = sampleForSpark(sorted);
		const latest = stats[0];
		const startTime = new Date(sorted[0].time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		const endTime   = new Date(sorted[sorted.length - 1].time_end * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		rangeLabel = chalk.dim(`${startTime} → ${endTime}`);
		const header = `${chalk.bold.cyan('X-Ray Stats')}  ${chalk.white(app)}\n${rangeLabel}  ${intervalLabel}${fetchedLabel}${errorLabel}`;

		const periodMins   = sorted.length > 0 ? Math.max(1, (sorted[0].time_end - sorted[0].time) / 60) : 1;
		const requests     = sample.map(s => (s.requests || 0) / periodMins);
		const latency      = sample.map(s => (s.latency || 0) * 1000);
		const dbLatency    = sample.map(s => (s.db_latency || 0) * 1000);
		const dbRepLatency = sample.map(s => (s.db_replica_latency || 0) * 1000);
		const cacheLatency = sample.map(s => (s.cache_latency || 0) * 1000);
		const errorRate    = sample.map(s => s.error_rate || 0);
		const faultRate    = sample.map(s => s.fault_rate || 0);
		const apdexVals    = sample.map(s => typeof s.apdex === 'object' ? (s.apdex.value || 0) : (s.apdex || 0));

		const totalRequests = stats.reduce((t, s) => t + (s.requests || 0), 0);
		const totalErrors   = stats.reduce((t, s) => t + (s.errors   || 0), 0);
		const totalFaults   = stats.reduce((t, s) => t + (s.faults   || 0), 0);
		const latestApdex   = typeof latest.apdex === 'object' ? (latest.apdex.value || 0) : (latest.apdex || 0);
		const latestRpm     = (latest.requests || 0) / periodMins;

		const LABEL = 13;
		const SPARK = sample.length; // actual data points, not terminal max
		const row = (label, spark, current, detail = '') => {
			const pad = ' '.repeat(Math.max(0, SPARK - spark.length));
			return `${chalk.blue(label.padEnd(LABEL))}  ${chalk.grey(spark)}${pad}  ${current}${detail ? '  ' + chalk.dim(detail) : ''}`;
		};

		const errColor   = totalErrors > 0 ? chalk.yellow : chalk.green;
		const faultColor = totalFaults > 0 ? chalk.red    : chalk.green;
		const apdexColor = latestApdex >= 0.9 ? chalk.green : latestApdex >= 0.7 ? chalk.yellow : chalk.red;

		const lines = [
			header,
			'',
			row('Requests',      sparkline(requests),    chalk.white(latestRpm.toFixed(1)) + chalk.dim('/min'), `${totalRequests} total`),
			row('Apdex',         sparkline(apdexVals),   apdexColor(latestApdex.toFixed(2))),
			row('Response Time', sparkline(latency),     chalk.white(formatDuration(latest.latency || 0)),      `max ${formatDuration(Math.max(...latency) / 1000)}`),
			row('DB',            sparkline(dbLatency),   chalk.white(formatDuration(latest.db_latency || 0))),
		];

		if (stats.some(s => (s.db_replica_latency || 0) > 0)) {
			lines.push(row('DB Replica', sparkline(dbRepLatency), chalk.white(formatDuration(latest.db_replica_latency || 0))));
		}

		lines.push(
			row('Cache',  sparkline(cacheLatency), chalk.white(formatDuration(latest.cache_latency || 0))),
			row('Errors', sparkline(errorRate),    errColor(`${((latest.error_rate || 0) * 100).toFixed(1)}%`),   `${totalErrors} total`),
			row('Faults', sparkline(faultRate),    faultColor(`${((latest.fault_rate || 0) * 100).toFixed(1)}%`), `${totalFaults} total`),
		);

		lines.push('');
		MENU.forEach((item, i) => {
			const active = i === menuIndex;
			const prefix = active ? `${chalk.cyan('❯')} ` : '  ';
			let baseLabel = item.label;
			let countStr = '';
			let countColor = chalk.dim;

			if (Array.isArray(allTraces)) {
				if (item.action === 'recent') {
					countStr = `(${allTraces.length})`;
					countColor = allTraces.length > 0 ? chalk.white : chalk.dim;
				} else if (item.action === 'slow') {
					const count = allTraces.filter(t => (t.Duration || 0) >= 2 || (t.ResponseTime || 0) >= 2).length;
					countStr = `(${count})`;
					countColor = count > 0 ? chalk.yellow : chalk.dim;
				} else if (item.action === 'errors') {
					const count = allTraces.filter(t => t.HasError || t.HasThrottle).length;
					countStr = `(${count})`;
					countColor = count > 0 ? chalk.yellow : chalk.dim;
				} else if (item.action === 'faults') {
					const count = allTraces.filter(t => t.HasFault || ((t.Http || {}).HttpStatus || 0) >= 500).length;
					countStr = `(${count})`;
					countColor = count > 0 ? chalk.red : chalk.dim;
				}
			}

			const labelText = active
				? chalk.bold.cyan(baseLabel) + (countStr ? ' ' + chalk.bold.cyan(countStr) : '')
				: chalk.dim(baseLabel) + (countStr ? ' ' + countColor(countStr) : '');
			lines.push(`${prefix}${labelText}`);
		});
		lines.push('');
		lines.push(chalk.dim('↑↓ navigate  ↵ select  r refresh  +/- interval  q quit'));

		logUpdate(lines.join('\n'));
	}

	async function goToTraces(filterOpts) {
		cleanup();
		const spinner = ora('Fetching traces…').start();
		let traces = null;
		try {
			({ traces } = await fetchSummaries(v, app, { ...argv, after, before, ...filterOpts }));
			spinner.succeed(`Loaded ${traces.length} trace${traces.length === 1 ? '' : 's'}.`);
		} catch (err) {
			spinner.fail('Could not load traces.');
			console.error(chalk.red(err.message));
		}
		await pickAndInspectTrace(v, app, { ...argv, after, before }, filterOpts, traces);
		process.exit(0);
	}

	async function doRefresh({ showSpinner = false } = {}) {
		let spinner;
		fetchError = null;
		if (showSpinner) {
			logUpdate.clear();
			spinner = ora({ text: `${stats.length ? 'Refreshing' : 'Loading'} X-Ray data for ${app}…`, discardStdin: false }).start();
		}
		try {
			const [statsResult, tracesResult] = await Promise.all([
				fetchStatsWithCache(v, app, after, before),
				fetchSummaries(v, app, { ...argv, after, before }).catch(() => null),
			]);
			stats = statsResult;
			if (tracesResult) {
				allTraces = tracesResult.traces;
			}
			lastFetched = new Date().toLocaleTimeString();
			if (spinner) {
				spinner.succeed(`${stats.length ? 'Loaded' : 'No'} X-Ray data for ${app}.`);
			}
		} catch (err) {
			fetchError = err.message;
			if (spinner) {
				spinner.fail(`Could not load X-Ray data for ${app}.`);
			}
		}
		render();
	}

	function scheduleRefresh() {
		clearInterval(refreshTimer);
		refreshTimer = setInterval(doRefresh, interval * 1000);
	}

	function cleanup() {
		clearInterval(refreshTimer);
		process.stdin.setRawMode(false);
		process.stdin.pause();
		logUpdate.done();
	}

	process.stdin.setRawMode(true);
	process.stdin.resume();
	process.stdin.setEncoding('utf8');
	readline.emitKeypressEvents(process.stdin);

	async function selectMenuItem(i) {
		busy = true;
		const action = MENU[i].action;
		if (action === 'recent') await goToTraces({});
		if (action === 'slow')   await goToTraces({ slow: 2 });
		if (action === 'errors') await goToTraces({ filter: 'error' });
		if (action === 'faults') await goToTraces({ faults: true });
		if (action === 'export') {
			cleanup();
			const traces = allTraces || [];
			const { filename } = await inquirer.prompt([{
				type: 'input',
				name: 'filename',
				message: 'Output filename:',
				default: `xray-${app}-${Date.now()}.json`,
			}]);
			fs.writeFileSync(filename, JSON.stringify(traces, null, 2));
			console.log(chalk.green(`Wrote ${traces.length} traces to ${filename}`));
			process.exit(0);
		}
	}

	process.stdin.on('keypress', async (str, key) => {
		if (busy) return;
		if (!key) return;
		if ((key.ctrl && key.name === 'c') || str === 'q') { cleanup(); process.exit(0); }
		if (key.name === 'up')     { menuIndex = (menuIndex - 1 + MENU.length) % MENU.length; render(); }
		if (key.name === 'down')   { menuIndex = (menuIndex + 1) % MENU.length; render(); }
		if (key.name === 'return') { await selectMenuItem(menuIndex); }
		if (str === 'r') { busy = true; await doRefresh({ showSpinner: true }); busy = false; }
		if (str === '+' || str === '=') { if (interval < 120) { interval = Math.min(120, interval + 15); scheduleRefresh(); render(); } }
		if (str === '-') { if (interval > 10) { interval = Math.max(10, interval - 15); scheduleRefresh(); render(); } }
	})

	process.on('SIGTERM', cleanup);

	await doRefresh({ showSpinner: true });
	scheduleRefresh();

	await new Promise(resolve => process.stdin.once('close', resolve));
}


// ── Command export ─────────────────────────────────────────────────────────────

export default {
	command: 'xray [stack]',
	description: 'X-Ray live stats and trace browser.',
	builder: yargs => yargs
		.command({
			command: '$0 [stack]',
			description: 'Interactive live dashboard.',
			builder: y => y
				.option('after',    { type: 'string', description: 'Start of time window.', default: '1 hour ago' })
				.option('before',   { type: 'string', description: 'End of time window.',   default: 'now' })
				.option('interval', { type: 'number', description: 'Refresh interval in seconds.', default: 30 }),
			handler: watchHandler,
		})
		.command({
			command: 'list-traces [stack]',
			description: 'List recent traces as a table.',
			builder: y => y
				.option('after',         { type: 'string',  description: 'Start of time window.',                default: '15 minutes ago' })
				.option('before',        { type: 'string',  description: 'End of time window.',                  default: 'now' })
				.option('next-token',    { type: 'string',  description: 'Pagination token.' })
				.option('group-by',      { type: 'string',  choices: ['url', 'status', 'method', 'client-ip'],   description: 'Group results.' })
				.option('errors',        { type: 'boolean', description: 'Filter to 4xx client errors.' })
				.option('faults',        { type: 'boolean', description: 'Filter to 5xx server faults.' })
				.option('slow',          { type: 'number',  description: 'Filter to traces slower than N seconds.' })
				.option('status',        { type: 'string',  description: 'Filter by HTTP status, e.g. ">=500".' })
				.option('response-time', { type: 'string',  description: 'Filter by response time, e.g. ">2".' })
				.option('url-contains',  { type: 'string',  description: 'Filter by URL substring.' })
				.option('method',        { type: 'string',  description: 'Filter by HTTP method.' })
				.option('admin',         { type: 'boolean', description: 'Filter to wp-admin requests.' })
				.option('rest',          { type: 'boolean', description: 'Filter to REST API requests.' })
				.option('filter',        { type: 'string',  description: 'Raw X-Ray filter expression.' })
				.option('json',          { type: 'boolean', description: 'Print JSON output.' })
				.option('output',        { type: 'string',  description: 'Write JSON to file (with --json).' })
				.option('debug',         { type: 'boolean', default: false, description: 'Print compiled filter expression.' }),
			handler: summaryHandler,
		})
		.command({
			command: 'trace <id> [stack]',
			description: 'Show a single trace by ID.',
			builder: y => y
				.positional('id',    { type: 'string',  description: 'Trace ID.' })
				.positional('stack', { type: 'string',  description: 'App ID.' })
				.option('json',      { type: 'boolean', description: 'Print JSON output.' })
				.option('output',    { type: 'string',  description: 'Write JSON to file (with --json).' }),
			handler: traceHandler,
		})
		.command({
			command: 'trace-file <path>',
			description: 'Inspect a trace from a local JSON export.',
			builder: y => y
				.positional('path',  { type: 'string', description: 'Path to JSON file.' })
				.option('stack',     { type: 'string', description: 'App ID for dashboard links.' }),
			handler: traceFileHandler,
		}),
};
