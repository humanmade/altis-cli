import got, { type OptionsInit, type Request } from 'got';
interface StreamOptions { retry?: number | false; request?: OptionsInit; }
import split from 'split2';
import once from 'once';

export default function(url: string, opts: StreamOptions = {}) {
	if (!opts) opts = {};
	if (typeof opts.retry !== 'number' && opts.retry !== false) opts.retry = 3000;

	let buf = '';
	let nextType = 'message';
	let timeout: NodeJS.Timeout | undefined;
	let opened = false;
	let onclose: () => void;
	let lastEventId = '';
	let destroyed = false;
	let stream: Request | undefined;

	const parse = split(function(line) {
		if (!line) {
			if (!buf) return;
			const data = buf;
			buf = '';
			const type = nextType;
			nextType = 'message';
			return { type, data };
		}
		if (line.indexOf('event: ') === 0) {
			nextType = line.slice(7);
		} else if (line.indexOf('id: ') === 0) {
			lastEventId = line.slice(4);
		} else if (line.indexOf('data: ') === 0) {
			buf += (buf ? '\n' : '') + line.slice(6);
		}
	});

	function connect() {
		if (destroyed) return;
		const reqOpts: OptionsInit & { isStream: true; headers: Record<string, string | string[] | undefined> } = {
			...opts.request,
			isStream: true as const,
			headers: { ...opts.request?.headers },
		};

		if (lastEventId !== '') {
			reqOpts.headers['Last-Event-ID'] = lastEventId;
		}

		buf = '';

		stream = got.stream(url, reqOpts);

		onclose = once(() => {
			if (destroyed) return;

			if (!opts.retry) {
				destroyed = true;
				return parse.end();
			}

			timeout = setTimeout(connect, opts.retry);
			parse.emit('retry');
		});

		stream.on('error', err => {
			if (!opts.retry) parse.emit('error', err);
			onclose();
		});

		stream.on('response', res => {
			if (!opened) {
				parse.emit('open');
				opened = true;
			} else {
				parse.emit('reconnect');
			}
			res.on('end', onclose);
		});

		stream.pipe(parse, { end: false });
	}

	connect();

	parse.destroy = function() {
		if (destroyed) return parse;
		destroyed = true;
		clearTimeout(timeout);
		opts.retry = false;
		if (stream) stream.destroy();
		parse.emit('close');
		return parse;
	};

	return parse;
};
