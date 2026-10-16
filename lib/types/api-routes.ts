import type { RequestInit, Response } from 'node-fetch';
import type { ApplicationInfo, ApplicationResponse, Backup, Build, CliSession, DatabaseTables, Deploy, Domain, ImportSession, InstanceAccessRow, InstanceAccessResponse, InstanceMaintenanceResponse, InstanceReport, InstanceResponse, LogResponse, Package, RunningTasksResponse, TaskResult, UserResponse, Variable } from './api.ts';
import type { ServiceGraph, Statistic, Trace, TraceSummary } from './xray.ts';

type Read<R, Q = never> = { GET: { response: R; query: Q } };
type Write<R, B = never, Q = never> = { response: R; body: B; query: Q };
type Task = string | TaskResult;
export interface BackupQuery { database?: boolean | 0 | 1; uploads?: boolean | 0 | 1; stream?: boolean; tables?: string[]; mydumper?: boolean; site_id?: number; uploads_path?: string; stream_json?: boolean; }
export interface DatabaseImportBody { from_application: string; tables?: string[]; replacements?: Record<string, string>; use_mydumper?: boolean; post_sync?: boolean; }
export interface UploadsImportBody { from_application: string; path?: string; method?: 'diff' | 'legacy'; }
interface LogQuery { after?: string; before?: string; search?: string; }
interface PaginatedLogQuery extends LogQuery { next_token?: string; stream?: boolean; }
interface StatusLogQuery extends LogQuery { status?: ('fail' | 'success')[]; }
interface AccessLogQuery { after?: string; before?: string; format?: 'json' | 'csv'; download?: boolean; filter?: Record<string, string>; }
interface TimeQuery { after?: string; before?: string; }

/** Backend contracts for every REST operation currently used by the CLI. */
export interface ApiRoutes {
	'stack/applications': Read<ApplicationResponse[]>;
	'stack/applications/:app': Read<ApplicationInfo, { _embed?: boolean }>;
	'stack/applications/:app/backups': Read<Backup[]> & { POST: Write<string, never, BackupQuery> };
	'stack/applications/:app/builds': Read<Build[]> & { POST: Write<Task, never, { stream?: boolean; force?: boolean }> };
	'stack/applications/:app/builds/build-cache': { DELETE: Write<boolean> };
	'stack/applications/:app/deploys': Read<Deploy[]> & { POST: Write<string, never, { stream?: boolean; force?: boolean; build?: string }> };
	'stack/applications/:app/import-database': Read<ImportSession[]> & { POST: Write<Task, DatabaseImportBody, { stream?: boolean }> };
	'stack/applications/:app/import-uploads': Read<ImportSession[]> & { POST: Write<Task, UploadsImportBody, { stream?: boolean }> };
	'stack/applications/:app/variables/:variableType': Read<Variable[]> & { POST: Write<Variable, { name: string; value: string; secret?: boolean }> };
	'stack/applications/:app/variables/:variableType/:name': Read<Variable> & { PUT: Write<Variable, { value: string }>; DELETE: Write<null> };
	'stack/applications/:app/domains': Read<Domain[]> & { POST: Write<Domain[], { domains: string[]; origin?: string }> };
	'stack/applications/:app/domains/:domain': { DELETE: Write<boolean> };
	'stack/applications/:app/domains/:domain/retry-failed-domain': { POST: Write<boolean> };
	'stack/applications/:app/iplists/:ipType': Read<string[]> & { POST: Write<string[], { ip_addresses: string[] }> };
	'stack/applications/:app/ua-blocklist': Read<string[]> & { POST: Write<string[], { patterns: string[] }> };
	'stack/applications/:app/database-tables': Read<DatabaseTables>;
	'stack/applications/:app/uploads-prefixes': Read<{ prefixes: string[] }>;
	'stack/applications/:app/packages': Read<Package[]>;
	'stack/applications/:app/packages/:build': Read<Package[]>;
	'stack/applications/:app/cli/sessions': { POST: Write<CliSession> };
	'stack/applications/:app/logs/:logType': Read<LogResponse[], LogQuery>;
	'stack/applications/:app/logs/php': Read<LogResponse[], PaginatedLogQuery>;
	'stack/applications/:app/logs/nginx': Read<LogResponse[], PaginatedLogQuery>;
	'stack/applications/:app/logs/cron': Read<LogResponse[], StatusLogQuery>;
	'stack/applications/:app/logs/email': Read<LogResponse[], StatusLogQuery>;
	'stack/applications/:app/logs/access': Read<string, AccessLogQuery>;
	'stack/applications/:app/logs/elasticsearch/:esType': Read<LogResponse[], LogQuery>;
	'stack/applications/:app/nodejs/logs/nodejs': Read<LogResponse[], PaginatedLogQuery>;
	'stack/applications/:app/xray/statistics': Read<Statistic[], TimeQuery>;
	'stack/applications/:app/xray/service-graph': Read<ServiceGraph, TimeQuery>;
	'stack/applications/:app/xray/traces/summaries': Read<TraceSummary[], TimeQuery & { filter?: string; previous_token?: string }>;
	'stack/applications/:app/xray/traces/:trace': Read<Trace>;
	'stack/instances': Read<InstanceResponse[]>;
	'stack/instances/:instance': Read<InstanceResponse>;
	'stack/instances/:instance/reports': Read<InstanceReport[]>;
	'stack/instances/:instance/maintenance': Read<InstanceMaintenanceResponse, { include_meta?: boolean }> & { PATCH: Write<InstanceMaintenanceResponse, Pick<InstanceMaintenanceResponse, 'contacts'>> };
	'stack/instances/:instance/access': Read<InstanceAccessRow[]> & { POST: Write<{ pending?: boolean }, { email: string; role?: 'user' | 'developer' | 'admin' }> };
	'stack/instances/:instance/access/:user': { DELETE: Write<InstanceAccessResponse> };
	'stack/running-tasks': Read<RunningTasksResponse[]>;
	'stack/running-tasks/:task': { DELETE: Write<RunningTasksResponse[]> };
	'wp/v2/users/me': Read<UserResponse>;
}

type MatchSegment<P extends string, R extends string> = R extends ':variableType' ? P extends 'app' | 'build' ? true : false
	: R extends ':ipType' ? P extends 'allow' | 'deny' ? true : false
	: R extends ':logType' ? P extends 'php' | 'nginx' | 'access' | 'cron' | 'raw-cron' | 'email' | 'db-general' | 'db-error' | 'db-slowquery' ? true : false
	: R extends ':esType' ? P extends 'search' | 'index' | 'error' ? true : false
	: R extends `:${string}` ? P extends '' ? false : true : P extends R ? true : false;
type MatchPath<P extends string, R extends string> = P extends `${infer H}/${infer T}`
	? R extends `${infer RH}/${infer RT}` ? MatchSegment<H, RH> extends true ? MatchPath<T, RT> : false : false
	: R extends `${string}/${string}` ? false : MatchSegment<P, R>;
type Candidates<P extends string> = P extends unknown ? { [R in keyof ApiRoutes]: MatchPath<P, R> extends true ? R : never }[keyof ApiRoutes] : never;
type Pattern<R extends string> = R extends `${infer H}/${infer T}` ? `${H extends `:${string}` ? string : H}/${Pattern<T>}` : R extends `:${string}` ? string : R;
type Narrower<R extends string, C extends string> = C extends unknown ? Pattern<C> extends Pattern<R> ? C extends R ? never : C : never : never;
type MostSpecific<R extends string, C extends string = R> = R extends unknown ? [Narrower<R, C>] extends [never] ? R : never : never;
type Canonical<P extends string> = P extends `/api/${infer R}` ? R : P;
type Route<P extends string> = P extends unknown ? MostSpecific<Candidates<Canonical<P>>> : never;
type Operation<P extends string, M extends string> = M extends keyof ApiRoutes[Route<P>] ? ApiRoutes[Route<P>][M] : never;
type Field<O, K extends PropertyKey> = K extends keyof O ? O[K] : never;
type OptionalField<O, K extends 'body' | 'query'> = [Field<O, K>] extends [never] ? { [F in K]?: never } : K extends 'body' ? { body: Field<O, K> } : { query?: Field<O, K> };
export type ApiOptions<P extends string, M extends string = 'GET'> = [Operation<P, M>] extends [never] ? never : Omit<RequestInit, 'body' | 'method'> &
	(M extends 'GET' ? { method?: M } : { method: M }) & OptionalField<Operation<P, M>, 'body'> & OptionalField<Operation<P, M>, 'query'>;
export type ApiResponse<P extends string, M extends string = 'GET'> = Field<Operation<P, M>, 'response'>;
export type KnownPath<P extends string> = P extends unknown ? P extends `${string}?${string}` | `${string}#${string}` ? never : [Route<P>] extends [never] ? never : P : never;
export type ApiMethod<P extends string> = keyof ApiRoutes[Route<P>] & string;
export interface ApiErrorResponse { message?: string; code?: string; data?: { status?: number }; }
export type TypedResponse<T> = Omit<Response, 'json' | 'ok'> & (
	{ ok: true; json(): Promise<T> } | { ok: false; json(): Promise<ApiErrorResponse> }
);

export type KnownGetPath<P extends string> = 'GET' extends ApiMethod<P> ? KnownPath<P> : never;
export interface TransportOptions extends Omit<RequestInit, 'body'> { body?: unknown; query?: object; }
