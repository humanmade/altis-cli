// Based on https://github.com/mafintosh/event-source-stream

var request = require('request')
var split = require('split2')
var once = require('once')

module.exports = function(url, opts) {
	if (!opts) opts = {}
	if (typeof opts.retry !== 'number' && opts.retry !== false) opts.retry = 3000

	var buf = ''
	var nextType = 'message'
	var req
	var timeout
	var opened = false
	var onclose
	var lastEventId = ''

	var parse = split(function(line) {
		if (!line) {
			if (!buf) return
			var data = buf
			buf = ''
			var type = nextType
			nextType = 'message'
			return { type, data }
		}
		if (line.indexOf('event: ') === 0) {
			nextType = line.slice(7)
		} else if (line.indexOf('id: ') === 0) {
			lastEventId = line.slice(4)
		} else if (line.indexOf('data: ') === 0) {
			buf += (buf ? '\n' : '') + line.slice(6)
		}
	})

	var connect = function() {
		var reqOpts = opts.request || {}
		reqOpts.url = url
		if (lastEventId !== '') {
			reqOpts.headers = reqOpts.headers || {}
			reqOpts.headers['Last-Event-ID'] = lastEventId
		}
		buf = ''
		req = request(reqOpts)

		onclose = once(function () {
			if (destroyed) return

			if (!opts.retry) {
				destroyed = true
				return parse.end()
			}

			timeout = setTimeout(connect, opts.retry)
			parse.emit('retry')
		})

		req.on('error', function(err) {
			if (!opts.retry) parse.emit('error', err)
			onclose()
		})

		req.on('complete', onclose)

		req.on('response', function (res) {
			if (!opened) {
				parse.emit('open')
				opened = true
			} else {
				parse.emit('reconnect')
			}
			res.on('end', onclose)
		})

		req.pipe(parse, {end:false})
	}

	connect()

	var destroyed = false
	parse.destroy = function() {
		if (destroyed) return
		destroyed = true
		clearTimeout(timeout)

		// Close connection, wait for attempt to retry.
		opts.retry = false;
		// if (req) req.abort()
		parse.emit('close')
	}

	return parse
}
