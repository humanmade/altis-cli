// Release smoke test.
//
// Builds the full command parser and renders --help. This dynamically imports
// every command module, so a broken import or syntax error anywhere in the
// command tree fails the build. It deliberately does NOT go through
// bin/altis-cli.js, which gates on configuration/setup and exits non-zero when
// unconfigured (e.g. in CI) — see https://github.com/humanmade/altis-cli/issues/47.

import configure from '../lib/commands/index.js';

const parser = await configure();
await parser.parse(['--help']);
