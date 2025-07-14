const got = require('got');
const split = require('split2');
const once = require('once');

module.exports = function(url, opts) {
	if (!opts) opts = {};
	if (typeof opts.retry !== 'number' && opts.retry !== false) opts.retry = 3000;

	let buf = '';
	let nextType = 'message';
	let timeout;
	let opened = false;
	let onclose;
	let lastEventId = '';
	let destroyed = false;
	let stream;

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
		const reqOpts = {
			headers: {},
			...opts.request,
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
		if (destroyed) return;
		destroyed = true;
		clearTimeout(timeout);
		opts.retry = false;
		if (stream) stream.destroy();
		parse.emit('close');
	};

	return parse;
};
