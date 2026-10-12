// File automatically generated, don't update directly. Run "yarn run update-rest-api-types" to update.

export interface ApplicationResponse {
	id: string;
	contact_provider: string;
	contact_client: string;
	display_name: string;
	notes: string;
	'git-deployment': Deployment;
	version: string;
	internal_domain: string;
	internal_nodejs_domain: string;
	'proxy-ssh-details': {
		[k: string]: any;
	};
	'aws-console-url': string;
	architecture: string;
	status: string;
	ami: string;
	'instance-type': string;
	domains: string[];
	region: string;
	log_shipping_destination_bucket: string | null;
	log_shipping_destination_kms_key_arn: string | null;
	'has-sandbox': boolean;
	'ssh-connection-string': string;
	'environment-type': string;
	'wordpress-version': string;
	'hm-platform-version': string;
	'altis-version': string | null;
	'php-version': string;
	php_version_deployed: string;
	php_version_change_status: string | null;
	latest_php_version_change_relationship: {before: string; after: string} | null;
	'mysql-version': string;
	'elasticsearch-version': string | null;
	apdex_t: number;
	waf_settings: {
		bot_status?: 'disabled' | 'count' | 'active';
		bot_actions?: { [rule: string]: 'allow' | 'block' | 'captcha' | 'challenge' };
	} | null;
	'altis-instance': string | null;
	instance?: string;
	can: {
		read: boolean;
		develop: boolean;
		administrate: boolean;
	};
	has: {
		advanced_traffic: boolean;
		afterburner: boolean;
		bot_control: boolean;
		custom_domains: boolean;
		elasticsearch: boolean;
		nodejs: boolean;
		query_log: boolean;
		log_shipping: boolean;
	};
	flags: {
		export: boolean;
		secrets: boolean;
		ip_management: boolean;
		ua_blocking: boolean;
	};
	_internal?: {
		tfc?: {
			provider: string;
			id: string;
		};
	};
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}
export interface Deployment {
	url: string;
	ref: string;
	is_autoupdating: boolean;
	/**
	 * The ID of the connection used for the deployment.
	 */
	connection?: number;
	/**
	 * The ID of the repository used for the deployment.
	 */
	repository?: number;
	branch_details: {
		error: {
			message: string;
		};
		latest_commit: {
			rev: string;
			date: string;
			description: string;
			user: {
				[k: string]: any;
			};
		};
	};
}

export interface BuildResponse {
	id: string;
	date: string;
	commit: {
		[k: string]: any;
	};
	wordpress_version: string;
	hm_platform_version: string;
	user: number;
	status: 'succeeded' | 'failed' | 'in_progress';
	task_id: string;
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface DeployResponse {
	id: string;
	date: string;
	rev: string;
	description: string;
	'github-diff-url': string;
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface AmiResponse {
	id: string;
	date: string;
	description: string;
	name: string;
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface LogResponse {
	date: string;
	level: string;
	message: string;
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface BackupResponse {
	id: string;
	date: string;
	size: number;
	url: string;
	uploads: boolean;
	database: boolean;
	uploads_path: string;
	tables: string[];
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface CliSessionResponse {
	id: string;
	status: 'failed' | 'completed';
	token: string;
	stream_url: string;
	user: {
		name: string;
		avatar_urls: {
			'96': string;
		};
	};
	date: string;
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface DatabaseServerResponse {
	id: string;
	hostname: string;
	database: string;
	password: string;
	username: string;
	size: string;
	'sequelpro-file': string;
	'aws-console-url': string;
	status: string;
	status_detail: string;
	details: {
		id: string;
		status: string;
		version: string;
		storage: number;
		multi_az: boolean;
		backups: {
			retention: number;
			point_in_time: {
				earliest: string;
				latest: string;
			};
		};
		servers: {
			id: string;
			role: 'writer' | 'reader';
		}[];
	};
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface WebServerResponse {
	id: string;
	'id-address': string;
	status: string;
	size: string;
	'ssh-connection-string': string;
	'aws-console-url': string;
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface LoadBalancerResponse {
	id: string;
	hostname: string;
	'aws-console-url': string;
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface NodejsResponse {
	enabled: boolean;
	'git-deployment': {
		url: string;
		ref: string;
		is_autoupdating: boolean;
	};
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface MemcachedServerResponse {
	id: string;
	hostname: string;
	port: number;
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface PullRequestResponse {
	id: string;
	number: number;
	date: string;
	url: string;
	title: string;
	user: {
		name: string;
		avatar_urls: {
			'95': string;
		};
	};
	link: string;
	diff_url: string;
	status: string;
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface SandboxServerResponse {
	id: string;
	'id-address': string;
	status: string;
	size: string;
	'ssh-connection-string': string;
	'aws-console-url': string;
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

/**
 * Page requests a Traffic Management rule matched, by outcome.
 */
export interface PageRequestCounts {
	/**
	 * Page requests the rule matched that were allowed, including CAPTCHA or Challenge passes with a valid token
	 */
	allowed: number;
	/**
	 * Page requests the rule matched that were blocked
	 */
	blocked: number;
	/**
	 * Page requests the rule matched that were served a CAPTCHA
	 */
	captcha: number;
	/**
	 * Page requests the rule matched that were served a Challenge
	 */
	challenge: number;
	/**
	 * All page requests the rule matched; in Count Only mode this is the number an action would apply to
	 */
	total: number;
}

export interface TrafficStatsResponse {
	bot_status: {
		bot_verified_allowed: number;
		bot_verified_blocked: number;
		bot_unverified_allowed: number;
		bot_unverified_blocked: number;
		nonbot_verified_allowed: number;
		nonbot_verified_blocked: number;
		nonbot_unverified_allowed: number;
		nonbot_unverified_blocked: number;
	};
	/**
	 * Traffic breakdown by bot category
	 */
	bot_category: {
		archiver: {
			/**
			 * Count of allowed traffic in this category
			 */
			allowed: number;
			/**
			 * Count of blocked traffic in this category
			 */
			blocked: number;
		};
		seo: {
			/**
			 * Count of allowed traffic in this category
			 */
			allowed: number;
			/**
			 * Count of blocked traffic in this category
			 */
			blocked: number;
		};
		ai: {
			/**
			 * Count of allowed traffic in this category
			 */
			allowed: number;
			/**
			 * Count of blocked traffic in this category
			 */
			blocked: number;
		};
		content_fetcher: {
			/**
			 * Count of allowed traffic in this category
			 */
			allowed: number;
			/**
			 * Count of blocked traffic in this category
			 */
			blocked: number;
		};
		monitoring: {
			/**
			 * Count of allowed traffic in this category
			 */
			allowed: number;
			/**
			 * Count of blocked traffic in this category
			 */
			blocked: number;
		};
		social_media: {
			/**
			 * Count of allowed traffic in this category
			 */
			allowed: number;
			/**
			 * Count of blocked traffic in this category
			 */
			blocked: number;
		};
		http_library: {
			/**
			 * Count of allowed traffic in this category
			 */
			allowed: number;
			/**
			 * Count of blocked traffic in this category
			 */
			blocked: number;
		};
		search_engine: {
			/**
			 * Count of allowed traffic in this category
			 */
			allowed: number;
			/**
			 * Count of blocked traffic in this category
			 */
			blocked: number;
		};
		miscellaneous: {
			/**
			 * Count of allowed traffic in this category
			 */
			allowed: number;
			/**
			 * Count of blocked traffic in this category
			 */
			blocked: number;
		};
		email_client: {
			/**
			 * Count of allowed traffic in this category
			 */
			allowed: number;
			/**
			 * Count of blocked traffic in this category
			 */
			blocked: number;
		};
		link_checker: {
			/**
			 * Count of allowed traffic in this category
			 */
			allowed: number;
			/**
			 * Count of blocked traffic in this category
			 */
			blocked: number;
		};
		scraping_framework: {
			/**
			 * Count of allowed traffic in this category
			 */
			allowed: number;
			/**
			 * Count of blocked traffic in this category
			 */
			blocked: number;
		};
		advertising: {
			/**
			 * Count of allowed traffic in this category
			 */
			allowed: number;
			/**
			 * Count of blocked traffic in this category
			 */
			blocked: number;
		};
		security: {
			/**
			 * Count of allowed traffic in this category
			 */
			allowed: number;
			/**
			 * Count of blocked traffic in this category
			 */
			blocked: number;
		};
	};
	/**
	 * Traffic breakdown by bot detection signals
	 */
	signals: {
		automated_browser: {
			/**
			 * Count of allowed traffic in this category
			 */
			allowed: number;
			/**
			 * Count of blocked traffic in this category
			 */
			blocked: number;
		};
		known_bot_data_center: {
			/**
			 * Count of allowed traffic in this category
			 */
			allowed: number;
			/**
			 * Count of blocked traffic in this category
			 */
			blocked: number;
		};
		non_browser_user_agent: {
			/**
			 * Count of allowed traffic in this category
			 */
			allowed: number;
			/**
			 * Count of blocked traffic in this category
			 */
			blocked: number;
		};
	};
	/**
	 * Exact counts of the requests Traffic Management rules can act on, per category, signal and targeted protection rule. Unlike bot_category and signals, which sample all HTTP requests, these cover only page requests from bots the corresponding rule matched (unverified bots, or all bots for the AI category). Targeted rules require Advanced Traffic Management and have no sampled counterpart.
	 */
	page_requests: {
		bot_category: {
			archiver: PageRequestCounts;
			seo: PageRequestCounts;
			ai: PageRequestCounts;
			content_fetcher: PageRequestCounts;
			monitoring: PageRequestCounts;
			social_media: PageRequestCounts;
			http_library: PageRequestCounts;
			search_engine: PageRequestCounts;
			miscellaneous: PageRequestCounts;
			email_client: PageRequestCounts;
			link_checker: PageRequestCounts;
			scraping_framework: PageRequestCounts;
			advertising: PageRequestCounts;
			security: PageRequestCounts;
		};
		signals: {
			automated_browser: PageRequestCounts;
			known_bot_data_center: PageRequestCounts;
			non_browser_user_agent: PageRequestCounts;
		};
		/**
		 * Page requests matched by each Advanced Traffic Management targeted protection rule, keyed by the rule setting without its tgt_ prefix
		 */
		targeted: {
			volumetric_ip_token_absent: PageRequestCounts;
			token_absent: PageRequestCounts;
			volumetric_session: PageRequestCounts;
			volumetric_session_maximum: PageRequestCounts;
			signal_automated_browser: PageRequestCounts;
			signal_browser_automation_extension: PageRequestCounts;
			signal_browser_inconsistency: PageRequestCounts;
			ml_coordinated_activity_low: PageRequestCounts;
			ml_coordinated_activity_medium: PageRequestCounts;
			ml_coordinated_activity_high: PageRequestCounts;
			token_reuse_ip_low: PageRequestCounts;
			token_reuse_ip_medium: PageRequestCounts;
			token_reuse_ip_high: PageRequestCounts;
			token_reuse_country_low: PageRequestCounts;
			token_reuse_country_medium: PageRequestCounts;
			token_reuse_country_high: PageRequestCounts;
			token_reuse_asn_low: PageRequestCounts;
			token_reuse_asn_medium: PageRequestCounts;
			token_reuse_asn_high: PageRequestCounts;
		};
	};
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface TrafficBreakdownResponse {
	country: {
		[k: string]: {
			/**
			 * Count of allowed traffic in this category
			 */
			allowed?: number;
			/**
			 * Count of blocked traffic in this category
			 */
			blocked?: number;
			/**
			 * Count of traffic in this category that was challenged with a CAPTCHA
			 */
			captcha?: number;
			/**
			 * Count of traffic in this category that was challenged automatically
			 */
			challenge?: number;
			[k: string]: any;
		};
	};
	device: {
		[k: string]: {
			/**
			 * Count of allowed traffic in this category
			 */
			allowed?: number;
			/**
			 * Count of blocked traffic in this category
			 */
			blocked?: number;
			/**
			 * Count of traffic in this category that was challenged with a CAPTCHA
			 */
			captcha?: number;
			/**
			 * Count of traffic in this category that was challenged automatically
			 */
			challenge?: number;
			[k: string]: any;
		};
	};
	bot_name?: {
		[k: string]: {
			/**
			 * Count of allowed traffic in this category
			 */
			allowed?: number;
			/**
			 * Count of blocked traffic in this category
			 */
			blocked?: number;
			/**
			 * Count of traffic in this category that was challenged with a CAPTCHA
			 */
			captcha?: number;
			/**
			 * Count of traffic in this category that was challenged automatically
			 */
			challenge?: number;
			[k: string]: any;
		};
	};
	bot_org?: {
		[k: string]: {
			/**
			 * Count of allowed traffic in this category
			 */
			allowed?: number;
			/**
			 * Count of blocked traffic in this category
			 */
			blocked?: number;
			/**
			 * Count of traffic in this category that was challenged with a CAPTCHA
			 */
			captcha?: number;
			/**
			 * Count of traffic in this category that was challenged automatically
			 */
			challenge?: number;
			[k: string]: any;
		};
	};
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface TrafficUserAgentsResponse {
	user_agents: {
		user_agent: string;
		category: string;
		views: number;
	}[];
	/**
	 * How often the data is refreshed, in hours.
	 */
	updated_every_hours: number;
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface InstanceResponse {
	id: string;
	name: string;
	description: string;
	internal_note: string;
	notices: {
		message: string;
		level: 'major' | 'minor' | 'info';
	}[];
	users: number[];
	developers: number[];
	admins: number[];
	can: {
		read: boolean;
		develop: boolean;
		edit: boolean;
	};
	has: {
		connections: boolean;
	};
	production: string | null;
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface InstanceAccessResponse {
	user: number;
	role: 'user' | 'developer' | 'admin';
	has_2fa?: boolean;
	restricted?: boolean;
	pending: boolean;
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface InstanceSubscriptionResponse {
	id: string;
	crm_id?: string;
	crm_url?: string;
	account_manager: {
		id: number;
		name: string;
		email: string;
	};
	tiers: {
		product: string;
		environment: string;
		support: string;
	};
	display_tiers: {
		product: string;
		environment: string;
		support: string;
	};
	entitlements: {
		views: {
			period: 'monthly' | 'yearly';
			value: number;
		};
	};
	configuration: {
		region: string;
	};
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface NotificationDestinationsResponse {
	destinations: (
		| {
				type: 'slack';
				notification_types: ('deploy.start' | 'deploy.end' | 'import.start' | 'import.end')[];
				slack_endpoint: string;
		  }
		| {
				type: 'email';
				notification_types: ('deploy.start' | 'deploy.end' | 'import.start' | 'import.end')[];
				email: string;
		  }
	)[];
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface OnCallResponse {
	id: string;
	name: string;
	avatar_urls: {
		'96': string;
	};
	end_date: string;
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface RunningTasksResponse {
	application: string;
	date: string;
	description: string;
	log: string;
	user: {
		name: string;
		avatar_urls: {
			'96': string;
		};
	};
	id: string;
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface SupportTicketResponse {
	id: string;
	url: string;
	type: '-' | 'question' | 'incident' | 'problem' | 'task';
	title: string;
	content: string;
	priority: '-' | 'low' | 'normal' | 'high' | 'urgent';
	status: 'open' | 'pending' | 'hold' | 'solved' | 'new' | 'closed';
	satisfaction: 'unoffered' | 'offered' | 'good' | 'bad';
	author: {
		name: string;
		/**
		 * The user ID for the user.
		 */
		id: number;
		staff?: boolean;
		avatar_urls: {
			'96': string;
		};
	};
	assignee: {
		name: string;
		/**
		 * The user ID for the user.
		 */
		id: number;
		staff?: boolean;
		avatar_urls: {
			'96': string;
		};
	};
	requester: {
		name: string;
		/**
		 * The user ID for the user.
		 */
		id: number;
		staff?: boolean;
		avatar_urls: {
			'96': string;
		};
	};
	followers: number[];
	followers_users: {
		name: string;
		/**
		 * The user ID for the user.
		 */
		id: number;
		staff?: boolean;
		avatar_urls: {
			'96': string;
		};
	}[];
	instance: string;
	applications: string[];
	date: string;
	date_updated: string;
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface SupportTicketCommentResponse {
	id: string;
	type: 'comment' | 'change';
	date: string;
	content: {
		rendered: string;
	};
	public: boolean;
	author: {
		name: string;
		avatar_urls: {
			'96': string;
		};
	};
	attachments: SupportTicketCommentAttachment[];
	source: string;
	field: string;
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}
export interface SupportTicketCommentAttachment {
	id: number;
	name: string;
	url: string;
	content_type: string;
}

export interface MetricResponse {
	date: string;
	unit: string;
	value: number;
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface AuditLogResponse {
	id: string;
	type: string;
	date: string;
	object: string;
	description: string;
	user_id: number;
	user_email: string;
	user_avatar_url: string;
	user_username: string;
	user_display_name: string;
	user_ip: string;
	event: {
		[k: string]: any;
	};
	site_id: number;
	site_url: string;
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface UserResponse {
	/**
	 * Unique identifier for the user.
	 */
	id: number;
	/**
	 * Login name for the user.
	 */
	username: string;
	/**
	 * Display name for the user.
	 */
	name: string;
	/**
	 * First name for the user.
	 */
	first_name: string;
	/**
	 * Last name for the user.
	 */
	last_name: string;
	/**
	 * The email address for the user.
	 */
	email: string;
	/**
	 * URL of the user.
	 */
	url: string;
	/**
	 * Description of the user.
	 */
	description: string;
	/**
	 * Author URL of the user.
	 */
	link: string;
	/**
	 * Locale for the user.
	 */
	locale: '' | 'en_US';
	/**
	 * The nickname for the user.
	 */
	nickname: string;
	/**
	 * An alphanumeric identifier for the user.
	 */
	slug: string;
	/**
	 * Registration date for the user.
	 */
	registered_date: string;
	/**
	 * Roles assigned to the user.
	 */
	roles: string[];
	/**
	 * Password for the user (never included).
	 */
	password: string;
	/**
	 * All capabilities assigned to the user.
	 */
	capabilities: {
		[k: string]: any;
	};
	/**
	 * Any extra capabilities assigned to the user.
	 */
	extra_capabilities: {
		[k: string]: any;
	};
	/**
	 * Avatar URLs for the user.
	 */
	avatar_urls: {
		/**
		 * Avatar URL with image size of 24 pixels.
		 */
		'24': string;
		/**
		 * Avatar URL with image size of 48 pixels.
		 */
		'48': string;
		/**
		 * Avatar URL with image size of 96 pixels.
		 */
		'96': string;
	};
	/**
	 * Meta fields.
	 */
	meta: {};
	notices: {
		message: string;
		level: 'major' | 'minor' | 'info';
	}[];
	/**
	 * JWT Token to be used for embedding Productboard
	 */
	productboard_token: string;
	/**
	 * Whether the user has opted in to share personal information for data collection purposes
	 */
	has_opted_in_to_personal_data_collection: boolean;
	/**
	 * Whether the user has responded to a request to share personal information for data collection purposes.
	 */
	has_responded_to_personal_data_collection: boolean;
	/**
	 * The users simple local avatar
	 */
	simple_local_avatar: {
		[k: string]: any;
	};
	two_factor?: {
		required: boolean;
		available: string[];
		primary: string;
		backup_codes_remaining: number;
		revalidation: {
			last_validated: number;
			expires_at: number;
			expires_save: number;
		};
	};
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface PostResponse {
	/**
	 * The date the post was published, in the site's timezone.
	 */
	date: string | null;
	/**
	 * The date the post was published, as GMT.
	 */
	date_gmt: string | null;
	/**
	 * The globally unique identifier for the post.
	 */
	guid: {
		/**
		 * GUID for the post, as it exists in the database.
		 */
		raw: string;
		/**
		 * GUID for the post, transformed for display.
		 */
		rendered: string;
	};
	/**
	 * Unique identifier for the post.
	 */
	id: number;
	/**
	 * URL to the post.
	 */
	link: string;
	/**
	 * The date the post was last modified, in the site's timezone.
	 */
	modified: string;
	/**
	 * The date the post was last modified, as GMT.
	 */
	modified_gmt: string;
	/**
	 * An alphanumeric identifier for the post unique to its type.
	 */
	slug: string;
	/**
	 * A named status for the post.
	 */
	status: 'publish' | 'future' | 'draft' | 'pending' | 'private' | 'wp_stream_enabled' | 'wp_stream_disabled';
	/**
	 * Type of post.
	 */
	type: string;
	/**
	 * A password to protect access to the content and excerpt.
	 */
	password: string;
	/**
	 * Permalink template for the post.
	 */
	permalink_template: string;
	/**
	 * Slug automatically generated from the post title.
	 */
	generated_slug: string;
	/**
	 * The title for the post.
	 */
	title: {
		/**
		 * Title for the post, as it exists in the database.
		 */
		raw: string;
		/**
		 * HTML title for the post, transformed for display.
		 */
		rendered: string;
	};
	/**
	 * The content for the post.
	 */
	content: {
		/**
		 * Content for the post, as it exists in the database.
		 */
		raw: string;
		/**
		 * HTML content for the post, transformed for display.
		 */
		rendered: string;
		/**
		 * Version of the content block format used by the post.
		 */
		block_version: number;
		/**
		 * Whether the content is protected with a password.
		 */
		protected: boolean;
	};
	/**
	 * The ID for the author of the post.
	 */
	author: number;
	/**
	 * The excerpt for the post.
	 */
	excerpt: {
		/**
		 * Excerpt for the post, as it exists in the database.
		 */
		raw: string;
		/**
		 * HTML excerpt for the post, transformed for display.
		 */
		rendered: string;
		/**
		 * Whether the excerpt is protected with a password.
		 */
		protected: boolean;
	};
	/**
	 * The ID of the featured media for the post.
	 */
	featured_media: number;
	/**
	 * Whether or not comments are open on the post.
	 */
	comment_status: 'open' | 'closed';
	/**
	 * Whether or not the post can be pinged.
	 */
	ping_status: 'open' | 'closed';
	/**
	 * The format for the post.
	 */
	format: 'standard' | 'aside' | 'chat' | 'gallery' | 'link' | 'image' | 'quote' | 'status' | 'video' | 'audio';
	/**
	 * Meta fields.
	 */
	meta: {};
	/**
	 * Whether or not the post should be treated as sticky.
	 */
	sticky: boolean;
	/**
	 * The theme file to use to display the post.
	 */
	template: string;
	/**
	 * The terms assigned to the post in the category taxonomy.
	 */
	categories: number[];
	/**
	 * The terms assigned to the post in the post_tag taxonomy.
	 */
	tags: number[];
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface AccelerateSiteResponse {
	id: number;
	url: string;
	name: string;
	icon_url: string;
	connected: boolean;
	install_plugin_url: string;
	status: 'creating' | 'created' | 'failed';
	plugin_config: string;
	_embedded?: {[url: string]: unknown[]};
	_links?: {[url: string]: [{href: string}]};
}

export interface InstanceMaintenanceResponse {
	id: string;
	name: string;
	window: {
		production_day: number;
		nonproduction_day: number;
		start_time: number;
		end_time: number;
		timezone: string;
		gmt_offset: number;
	};
	account_managers: {
		name: string;
		email: string;
	}[];
	contacts: { email: string }[];
}
