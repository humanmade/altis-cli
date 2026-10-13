# altis-cli Agent Notes

Use this file when working on `altis-cli` implementation tasks.

## Vocabulary

- Prefer `app` for Vantage application commands.
- Keep `stack` working as a backwards-compatible alias.
- Use `instance` only for Vantage instance-level APIs.
- Backend routes still use `/stack/...`; do not rename API paths.

## Command Patterns

- Commands are ESM modules under `lib/commands`.
- `lib/buildSubcommands.ts` auto-loads `.js` files and directories with `index.js`.
- Application commands currently live under `lib/commands/stack`; `lib/commands/app/index.ts` aliases that command tree.
- Use yargs command modules with `command`, `description`, optional `builder`, and `handler`.
- Keep existing `stack` command behavior stable.

## Common Helpers

Use helpers from `lib/commands/stack/util.ts`:

- `getApp(argv)` / `getStack(argv)` for resolving the app id or prompting.
- `fetchJSON(v, url, opts)` for authenticated JSON API calls and backend error messages.
- `buildQuery(params)` for query string construction.
- `parseList(value)` for comma-separated flags.
- `parseKeyValueArgs(arr)` for repeatable `key=value` flags.
- `confirm(message)` before destructive operations unless `--yes` is passed.
- `printJSON(data)` and `printTable(rows)` for output.

## Flag Conventions

- Read commands should support `--json` where practical.
- Destructive commands should require confirmation unless `--yes` is passed.
- Date ranges use `--after` and `--before` and are passed to Vantage as strings.
- File output uses `--output <file>`.
- Streamed operations use `--resume <log-id>` and `--debug`.

## Vantage API

- Instantiate with `new Vantage(argv.config)`.
- Use relative API paths like `stack/applications/${app}/...`.
- Surface backend `message` fields directly.
- Do not add local AWS calls when an existing Vantage endpoint exists.

## Streaming

- Use `streamLog(vantage, app, logId, debug)` for build, deploy, import, and task streams.
- Existing stream helpers render progress but do not currently return a completion promise.

## Local Server Sync

- Local sync is expected to run from a local Altis project with `altis/local-server`.
- Prefer `app pull ...` in docs; keep `stack pull ...` as an alias.
- Use Vantage backups/exports for remote data and local-server commands for restore.

## X-Ray

- X-Ray is a separate PR from broad API coverage.
- Prefer `app xray ...`; keep `stack xray ...` as an alias.
- Human output is default.
- `--json` should return raw backend data.
- Do not add an `--llm` mode or built-in diagnosis in the first X-Ray PR.

Source files are TypeScript and import local modules with `.ts` extensions for native Node execution.
Use `npm run dev -- ...` on Node 22.18+ or 24+ without rebuilding.
The compiler rewrites relative extensions to `.js` for the published package.
Run `npm run typecheck` and `npm test`. API type snapshots are synchronized from
Vantage with `npm run sync-api-types -- /path/to/vantage/frontend`.
