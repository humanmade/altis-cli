/* https://docs.aws.amazon.com/xray/latest/devguide/xray-api-segmentdocuments.html */

export interface HttpData {
	request?: {
		method?: string;
		url?: string;
		user_agent?: string;
		client_ip?: string;
		x_forwarded_for?: boolean;
		traced?: boolean;
	};
	response?: {
		status?: number;
		content_length?: number;
	};
}

export interface SqlData {
	connection_string?: string;
	url?: string;
	sanitized_query?: string;
	database_type?: string;
	database_version?: string;
	driver_version?: string;
	user?: string;
	preparation?: string;
}

export interface ExceptionStackFrame {
	path?: string;
	line?: string;
	label?: string;
}

export interface Exception {
	id: string;
	message?: string;
	type?: string;
	stack?: ExceptionStackFrame[];
}

type Common = {
	name: string;
	id: string;
	start_time: number;
	end_time?: number;
	in_progress?: boolean;
	parent_id?: string;
	origin?: string;
	inferred?: boolean;

	http?: HttpData;
	sql?: SqlData;

	error?: boolean;
	throttle?: boolean;
	fault?: boolean;
	cause?: string | {
		working_directory?: string;
		paths?: string[];
		exceptions?: Exception[];
	};

	aws?: {
		instance_id?: string;
		ecs?: {
			container?: string;
		};
		ec2?: {
			availability_zone?: string;
		};
	};

	metadata?: {
		[ k: string ]: any,
	};

	annotations?: {
		[ k: string ]: string | number | boolean,
	};
	subsegments?: Subsegment[];
}

export interface Document extends Common {
	trace_id: string;
	service?: object;
}

export interface Subsegment extends Common {
	trace_id?: string;
	namespace?: string;
}

export interface Segment {
	Id: string;
	Document: Document;
}

export interface Trace {
	Id: string;
	Duration: number;
	Segments: Segment[];
}
