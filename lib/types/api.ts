import type { ApplicationResponse, BuildResponse, BackupResponse, CliSessionResponse, DatabaseServerResponse, WebServerResponse, LoadBalancerResponse } from './rest-api.ts';
export * from './rest-api.ts';
export type Deploy = import('./rest-api.ts').DeployResponse & { status?: string; build?: string; user?: string | { name: string } };
export type Build = BuildResponse & { source_version?: string; rev?: string };
export type Backup = BackupResponse & { status?: string };
export type CliSession = CliSessionResponse & { aws_ssm_session_id: string };
export type ApplicationInfo = Omit<ApplicationResponse, '_embedded'> & {
	_embedded: {
		'https://hm-stack.hm/load-balancer': [LoadBalancerResponse];
		'https://hm-stack.hm/database-server': [DatabaseServerResponse];
		'https://hm-stack.hm/web-server': [(WebServerResponse & { 'ip-address': string; 'scale-in-protection': boolean })[]];
		'https://hm-stack.hm/elasticsearch-cluster': [{ id: string; size: string; endpoint: string }];
	};
};
export interface Variable { name: string; value: string; secret?: boolean; modified?: string; last_modified?: string; }
export interface Domain { domain: string; name?: string; status: string; error?: string; origin?: string; certificate_status?: string; certificateStatus?: string; certificate_failure_reason?: string; }
export interface ImportSession { id: string; status: string; date: string; log?: string; }
export interface TaskResult { id?: string; task_id?: string; log?: string; }
export interface InstanceReport { year: number; month: number; topline?: { response_time?: number; uptime?: number; views?: number }; _links?: Record<string, { href: string }[]>; }
export interface InstanceAccessRow {
	id?: number;
	user?: number | { id: number; name: string; email: string };
	name?: string;
	email?: string;
	role: string;
	has_2fa?: boolean;
	restricted?: boolean;
}
export interface Package { type: string; name: string; version: string; latest?: string; latest_version?: string; vulnerabilities?: unknown[]; }
export interface DatabaseTables { tables: string[]; sites?: { id: number; domain: string; path: string }[]; }
