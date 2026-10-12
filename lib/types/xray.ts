// Segment document types are synchronized from Vantage's frontend.
import type { Subsegment } from './xray-segments.js';
export * from './xray-segments.js';

export interface TraceSummary {
	Id: string;
	Duration?: number;
	ResponseTime?: number;
	HasFault?: boolean;
	HasError?: boolean;
	HasThrottle?: boolean;
	Http?: { HttpStatus?: number; HttpMethod?: string; HttpURL?: string; ClientIp?: string };
}
export interface Statistic {
	time: number;
	time_end: number;
	requests?: number;
	latency?: number;
	db_latency?: number;
	db_replica_latency?: number;
	cache_latency?: number;
	error_rate?: number;
	fault_rate?: number;
	errors?: number;
	faults?: number;
	apdex?: number | { value?: number };
}
export interface ServiceGraph {
	Name?: string;
	Edges?: {
		Service?: { Name?: string };
		SummaryStatistics?: { TotalCount?: number; TotalResponseTime?: number; FaultStatistics?: { TotalCount?: number }; ErrorStatistics?: { TotalCount?: number } };
	}[];
}
export type FlatSegment = Pick<Subsegment, 'name' | 'sql' | 'http' | 'fault' | 'error' | 'cause' | 'annotations'> & { duration: number | null };
