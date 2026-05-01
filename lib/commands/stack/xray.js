import fs from 'fs';
import chalk from 'chalk';
import inquirer from 'inquirer';
import logUpdate from 'log-update';
import ora from 'ora';
import { getApp, fetchJSON, buildQuery, printJSON, printTable } from './util.js';
import Vantage from '../../vantage.js';

const SUBCOMMANDS = new Set(['summary', 'trace', 'graph', 'stats', 'watch']);
const SPARK = '▁▂▃▄▅▆▇█';

// ── Filter compiler ────────────────────────────────────────────────────────────

function compileFilter(argv) {
	const parts = [];
	if (argv.errors) parts.push('fault OR error OR http.status >= 500');
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

function isTraceId(s) {
	return s && /^1-[0-9a-f]{8}-[0-9a-f]+$/.test(s);
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
	console.log(chalk.dim(`\nInspect a trace: altis-cli app xray trace ${app} <id>`));
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
	const { name = '', start_time, end_time, sql, http, fault, error, subsegments } = node;
	const duration = (end_time != null && start_time != null) ? end_time - start_time : null;
	results.push({ name, duration, sql, http, fault, error });
	if (subsegments) {
		for (const sub of subsegments) {
			flattenSubsegments(sub, results);
		}
	}
	return results;
}

function printTraceDetail(trace) {
	const docs = (trace.Segments || []).map(s => s.Document).filter(Boolean);
	const root = docs.find(d => d.http && d.http.request) || docs[0];

	if (!root) {
		console.log(chalk.yellow('No segment data available.'));
		return;
	}

	const req = root.http && root.http.request;
	const res = root.http && root.http.response;
	const status = res && res.status;
	const duration = trace.Duration || (root.end_time - root.start_time);

	console.log('');
	console.log(
		statusColor(status)(`  ${status || '—'}`) +
		'  ' +
		chalk.bold(`${(req && req.method) || '—'} ${extractPath(req && req.url)}`)
	);
	console.log(chalk.dim(`  Total: ${formatDuration(duration)}`));
	if (root.fault) console.log(chalk.red('  ✖ fault'));
	if (root.error) console.log(chalk.yellow('  ✖ error'));
	if (root.throttle) console.log(chalk.magenta('  ✖ throttle'));
	console.log('');

	const allSegs = [];
	for (const doc of docs) {
		if (doc.subsegments) {
			for (const sub of doc.subsegments) {
				flattenSubsegments(sub, allSegs);
			}
		}
	}

	const phpSegs    = allSegs.filter(s => /^php$/i.test(s.name));
	const sqlSegs    = allSegs.filter(s => s.sql);
	const cacheSegs  = allSegs.filter(s => !s.sql && !s.http && /cache|memcache|redis|object.cache/i.test(s.name));
	const remoteSegs = allSegs.filter(s => s.http && !s.sql);

	if (phpSegs.length) {
		const total = phpSegs.reduce((t, s) => t + (s.duration || 0), 0);
		console.log(`  ${chalk.blue('PHP')}             ${formatDuration(total)}`);
	}

	if (sqlSegs.length) {
		const total = sqlSegs.reduce((t, s) => t + (s.duration || 0), 0);
		const faults = sqlSegs.filter(s => s.fault || s.error).length;
		console.log(
			`  ${chalk.blue('SQL')}             ` +
			`${sqlSegs.length} quer${sqlSegs.length === 1 ? 'y' : 'ies'}  ${formatDuration(total)} total` +
			(faults ? chalk.red(`  ${faults} error${faults > 1 ? 's' : ''}`) : '')
		);
		sqlSegs.filter(s => (s.duration || 0) > 0.1).slice(0, 5).forEach(s => {
			const q = (s.sql && (s.sql.sanitized_query || s.sql.url)) || '';
			console.log(`    ${chalk.dim(formatDuration(s.duration))}  ${chalk.grey(q.slice(0, 80))}`);
		});
	}

	if (cacheSegs.length) {
		const total = cacheSegs.reduce((t, s) => t + (s.duration || 0), 0);
		console.log(`  ${chalk.blue('Cache')}           ${cacheSegs.length} op${cacheSegs.length === 1 ? '' : 's'}  ${formatDuration(total)} total`);
	}

	if (remoteSegs.length) {
		const total = remoteSegs.reduce((t, s) => t + (s.duration || 0), 0);
		const faults = remoteSegs.filter(s => s.fault || s.error).length;
		console.log(
			`  ${chalk.blue('HTTP')}            ` +
			`${remoteSegs.length} call${remoteSegs.length === 1 ? '' : 's'}  ${formatDuration(total)} total` +
			(faults ? chalk.red(`  ${faults} error${faults > 1 ? 's' : ''}`) : '')
		);
		remoteSegs.slice(0, 5).forEach(s => {
			const h = s.http;
			const rurl = (h && h.request && h.request.url) || '';
			const rstat = h && h.response && h.response.status;
			console.log(`    ${statusColor(rstat)(String(rstat || '—'))}  ${chalk.dim(formatDuration(s.duration))}  ${chalk.grey(extractPath(rurl).slice(0, 60))}`);
		});
	}

	const errorSegs = allSegs.filter(s => (s.fault || s.error) && !sqlSegs.includes(s) && !remoteSegs.includes(s));
	if (errorSegs.length) {
		console.log(`\n  ${chalk.red('Other errors/faults')}`);
		errorSegs.slice(0, 5).forEach(s => {
			const tag = s.fault ? chalk.red('fault') : chalk.yellow('error');
			console.log(`    ${tag}  ${s.name}  ${formatDuration(s.duration)}`);
		});
	}

	console.log('');
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

	const requests    = sample.map(s => s.requests);
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

	const startTime = new Date(sorted[0].time * 1000).toLocaleTimeString();
	const endTime   = new Date(sorted[sorted.length - 1].time_end * 1000).toLocaleTimeString();

	console.log('');
	console.log(chalk.dim(`  ${startTime} → ${endTime}  (${stats.length} period${stats.length === 1 ? '' : 's'})`));
	console.log('');

	const row = (label, spark, summary) =>
		`  ${chalk.blue(label.padEnd(14))}  ${chalk.grey(spark.padEnd(MAX_SPARK))}  ${summary}`;

	console.log(row('Requests',    sparkline(requests),    `${totalRequests} total`));
	console.log(row('Latency',     sparkline(latency),     `avg ${formatDuration(avg(latency) / 1000)}  max ${formatDuration(Math.max(...latency) / 1000)}`));
	console.log(row('DB',          sparkline(dbLatency),   `avg ${formatDuration(avg(dbLatency) / 1000)}`));
	if (stats.some(s => s.db_replica_latency > 0)) {
		console.log(row('DB Replica',  sparkline(dbRepLatency), `avg ${formatDuration(avg(dbRepLatency) / 1000)}`));
	}
	console.log(row('Cache',       sparkline(cacheLatency),`avg ${formatDuration(avg(cacheLatency) / 1000)}`));
	console.log(row('Errors',      sparkline(errorRate),   `${totalErrors} total  rate ${(avg(errorRate) * 100).toFixed(1)}%`));
	console.log(row('Faults',      sparkline(faultRate),   `${totalFaults} total  rate ${(avg(faultRate) * 100).toFixed(1)}%`));
	console.log(row('Apdex',       sparkline(apdexVals),   `avg ${avg(apdexVals).toFixed(2)}`));
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
	let { id, app } = argv;
	// Allow: xray trace 1-abc123 (no explicit app)
	if (!id && isTraceId(app)) {
		id = app;
		app = null;
	}
	if (!id) {
		throw new Error('Usage: altis-cli app xray trace <app> <trace-id>');
	}
	const resolvedApp = app ? app : await getApp({ ...argv, app: null });
	const v = new Vantage(argv.config);
	const spinner = ora('Fetching trace…').start();
	let data;
	try {
		data = await fetchJSON(v, `stack/applications/${resolvedApp}/xray/traces/${encodeURIComponent(id)}`);
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
	printTraceDetail(data);
	console.log(chalk.dim(`  Raw JSON: altis-cli app xray trace ${resolvedApp} ${id} --json`));
}

async function graphHandler(argv) {
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const spinner = ora('Fetching service graph…').start();
	let data;
	try {
		data = await fetchJSON(v, `stack/applications/${app}/xray/service-graph${buildQuery(timeParams(argv))}`);
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
		data = await fetchJSON(v, `stack/applications/${app}/xray/statistics${buildQuery(timeParams(argv))}`);
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

// ── Interactive explorer ───────────────────────────────────────────────────────

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
		const { selected } = await inquirer.prompt([{
			type: 'list',
			name: 'selected',
			message: 'Select trace:',
			choices,
			pageSize: 15,
		}]);
		if (!selected) break;

		const spinner2 = ora('Fetching trace detail…').start();
		let traceData;
		try {
			traceData = await fetchJSON(v, `stack/applications/${app}/xray/traces/${encodeURIComponent(selected.Id)}`);
			spinner2.stop();
		} catch (err) {
			spinner2.stop();
			console.error(chalk.red(err.message));
			continue;
		}

		printTraceDetail(traceData);
		console.log(chalk.dim(`  altis-cli app xray trace ${app} ${selected.Id}`));

		const http = selected.Http || {};
		const followUps = [
			{ name: 'Inspect another trace', value: 'another' },
		];
		if (http.HttpURL) {
			const path = extractPath(http.HttpURL);
			followUps.push({ name: `Narrow by URL: ${path.slice(0, 40)}`, value: 'url' });
		}
		if (http.HttpStatus) {
			followUps.push({ name: `Narrow by status: ${http.HttpStatus}`, value: 'status' });
		}
		followUps.push(
			{ name: 'Show service graph', value: 'graph' },
			{ name: 'Export trace JSON', value: 'json' },
			{ name: chalk.dim('← Back to main menu'), value: 'back' },
		);

		const { followUp } = await inquirer.prompt([{
			type: 'list',
			name: 'followUp',
			message: 'What next?',
			choices: followUps,
		}]);

		if (followUp === 'another') continue;
		if (followUp === 'back') break;
		if (followUp === 'graph') {
			await graphHandler({ ...argv, app });
			break;
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
			break;
		}
		if (followUp === 'status') {
			await pickAndInspectTrace(v, app, argv, { ...filterOpts, status: `= ${http.HttpStatus}` });
			break;
		}
	}
}

async function explorerHandler(argv) {
	const app = await getApp(argv);
	const v = new Vantage(argv.config);
	const after  = argv.after  || '15 minutes ago';
	const before = argv.before || 'now';

	// Prefetch all traces once so slow/error views show instantly.
	let allTraces = null;
	const spinner = ora(`Fetching traces for ${app}…`).start();
	try {
		({ traces: allTraces } = await fetchSummaries(v, app, { ...argv, after, before }));
		spinner.stop();
	} catch (err) {
		spinner.stop();
		// Non-fatal: slow/errors will fall back to individual fetches.
		if (argv.debug) console.error(chalk.dim(err.message));
	}

	// Client-side partitions derived from the prefetched set.
	const slowTraces  = allTraces ? allTraces.filter(t => (t.Duration || 0) >= 2 || (t.ResponseTime || 0) >= 2) : null;
	const errorTraces = allTraces ? allTraces.filter(t => t.HasError || t.HasFault || t.HasThrottle) : null;

	const label = (name, subset) => {
		if (!subset) return name;
		return subset.length ? `${name} ${chalk.yellow(`(${subset.length})`)}` : `${name} ${chalk.dim('(none)')}`;
	};

	while (true) {
		const { action } = await inquirer.prompt([{
			type: 'list',
			name: 'action',
			message: `X-Ray Explorer  ${chalk.dim(`[${app}  ${after} → ${before}]`)}`,
			choices: [
				{ name: label('Recent slow traces  ≥2s', slowTraces),  value: 'slow' },
				{ name: label('Recent errors and faults', errorTraces), value: 'errors' },
				{ name: 'Filter traces',         value: 'filter' },
				{ name: 'Service graph',         value: 'graph' },
				{ name: 'Statistics',            value: 'stats' },
				{ name: 'Export summaries JSON', value: 'export' },
				{ name: chalk.dim('Quit'),       value: 'quit' },
			],
		}]);

		if (action === 'quit') break;

		if (action === 'slow') {
			await pickAndInspectTrace(v, app, { ...argv, after, before }, { slow: 2 }, slowTraces);
			continue;
		}

		if (action === 'errors') {
			await pickAndInspectTrace(v, app, { ...argv, after, before }, { errors: true }, errorTraces);
			continue;
		}

		if (action === 'filter') {
			const { expr } = await inquirer.prompt([{
				type: 'input',
				name: 'expr',
				message: 'X-Ray filter expression (blank for none):',
			}]);
			// Custom filters always go to the server.
			await pickAndInspectTrace(v, app, { ...argv, after, before }, { filter: expr.trim() || undefined });
			continue;
		}

		if (action === 'graph') {
			try {
				await graphHandler({ ...argv, app, after, before });
			} catch (err) {
				console.error(chalk.red(err.message));
			}
			continue;
		}

		if (action === 'stats') {
			try {
				await statsHandler({ ...argv, app, after, before });
			} catch (err) {
				console.error(chalk.red(err.message));
			}
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
	let lastFetched = null;
	let fetchError = null;
	let refreshTimer = null;
	let busy = false;

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
		const header = `${chalk.bold.cyan('X-Ray Stats')}  ${chalk.white(app)}  ${intervalLabel}${fetchedLabel}${errorLabel}`;

		if (!stats.length) {
			logUpdate(`${header}\n\n  ${chalk.dim('Fetching…')}`);
			return;
		}

		const sorted = [...stats].reverse();
		const sample = sampleForSpark(sorted);
		const latest = stats[0];

		const requests     = sample.map(s => s.requests || 0);
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

		const LABEL = 12;
		const SPARK = sparkWidth();
		const row = (label, spark, current, detail = '') => {
			const pad = ' '.repeat(Math.max(0, SPARK - spark.length));
			return `  ${chalk.blue(label.padEnd(LABEL))}  ${chalk.grey(spark)}${pad}  ${current}${detail ? '  ' + chalk.dim(detail) : ''}`;
		};

		const errColor   = totalErrors > 0 ? chalk.yellow : chalk.green;
		const faultColor = totalFaults > 0 ? chalk.red    : chalk.green;
		const apdexColor = latestApdex >= 0.9 ? chalk.green : latestApdex >= 0.7 ? chalk.yellow : chalk.red;

		const lines = [
			header,
			'',
			row('Requests',  sparkline(requests),    chalk.white(String(latest.requests || 0)) + chalk.dim('/period'), `${totalRequests} total`),
			row('Latency',   sparkline(latency),     chalk.white(formatDuration(latest.latency || 0)),                 `max ${formatDuration(Math.max(...latency) / 1000)}`),
			row('DB',        sparkline(dbLatency),   chalk.white(formatDuration(latest.db_latency || 0))),
		];

		if (stats.some(s => (s.db_replica_latency || 0) > 0)) {
			lines.push(row('DB Replica', sparkline(dbRepLatency), chalk.white(formatDuration(latest.db_replica_latency || 0))));
		}

		lines.push(
			row('Cache',  sparkline(cacheLatency), chalk.white(formatDuration(latest.cache_latency || 0))),
			row('Errors', sparkline(errorRate),    errColor(`${((latest.error_rate || 0) * 100).toFixed(1)}%`),   `${totalErrors} total`),
			row('Faults', sparkline(faultRate),    faultColor(`${((latest.fault_rate || 0) * 100).toFixed(1)}%`), `${totalFaults} total`),
			row('Apdex',  sparkline(apdexVals),    apdexColor(latestApdex.toFixed(2))),
		);

		const startTime = new Date(sorted[0].time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		const endTime   = new Date(sorted[sorted.length - 1].time_end * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		const axisInner = Math.max(0, SPARK - startTime.length - endTime.length);
		const axis = chalk.dim(startTime + ' ' + '─'.repeat(axisInner) + ' ' + endTime);
		lines.push('', `  ${' '.repeat(LABEL + 2)}  ${axis}`);
		lines.push('', chalk.dim('  r refresh  +/- interval  q quit'));

		logUpdate(lines.join('\n'));
	}

	async function doRefresh() {
		fetchError = null;
		try {
			stats = await fetchJSON(v, `stack/applications/${app}/xray/statistics${buildQuery({ after, before })}`);
			lastFetched = new Date().toLocaleTimeString();
		} catch (err) {
			fetchError = err.message;
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

	process.stdin.on('data', async key => {
		if (busy) return;
		if (key === '\u0003' || key === 'q') { cleanup(); process.exit(0); }
		if (key === 'r') { busy = true; await doRefresh(); busy = false; }
		if ((key === '+' || key === '=') && interval < 120) { interval = Math.min(120, interval + 15); scheduleRefresh(); render(); }
		if (key === '-' && interval > 10)                   { interval = Math.max(10,  interval - 15); scheduleRefresh(); render(); }
	});

	process.on('SIGTERM', cleanup);

	await doRefresh();
	scheduleRefresh();

	await new Promise(resolve => process.stdin.once('close', resolve));
}


// ── Command export ─────────────────────────────────────────────────────────────

const handler = async argv => {
	let { subcommand, app, id } = argv;

	// 'xray myapp' → subcommand='myapp', app=undefined — shift args
	if (subcommand && !SUBCOMMANDS.has(subcommand)) {
		// Check if it looks like a trace ID (for: xray trace 1-abc...)
		if (!isTraceId(subcommand)) {
			app = subcommand;
		}
		subcommand = null;
	}

	const merged = { ...argv, app, id };

	switch (subcommand) {
		case 'summary': return summaryHandler(merged);
		case 'trace':   return traceHandler(merged);
		case 'graph':   return graphHandler(merged);
		case 'stats':   return statsHandler(merged);
		case 'watch':   return watchHandler(merged);
		default:        return explorerHandler(merged);
	}
};

export default {
	command: 'xray [subcommand] [app] [id]',
	description: 'X-Ray trace explorer.',
	builder: yargs => yargs
		.option('after',         { type: 'string',  description: 'Start of time window.',    default: '15 minutes ago' })
		.option('before',        { type: 'string',  description: 'End of time window.',      default: 'now' })
		.option('next-token',    { type: 'string',  description: 'Pagination token.' })
		.option('group-by',      { type: 'string',  choices: ['url', 'status', 'method', 'client-ip'], description: 'Group summary results.' })
		.option('errors',        { type: 'boolean', description: 'Filter to errors and faults.' })
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
		.option('interval',      { type: 'number',  description: 'Watch refresh interval in seconds.', default: 30 })
		.option('debug',         { type: 'boolean', default: false, description: 'Print compiled filter expression.' }),
	handler,
};
