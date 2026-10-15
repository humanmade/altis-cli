import type Config from '../config.ts';
import type { Options } from 'yargs';

/** Arguments are supplied by yargs and configuration by the executable. */
export interface CliArguments {
	config: Config;
	target?: string;
	table?: (string | number)[];
	src?: string;
	skipSearchReplace?: boolean;
	skipPostSync?: boolean;
	siteId?: (string | number)[];
	searchReplaceKey?: string;
	outputDir?: string;
	latest?: boolean;
	keepArchive?: boolean;
	dryRunSearchReplace?: boolean;
	dest?: string;
	group?: string;
	force?: boolean;
	app?: string;
	stack?: string;
	action?: string;
	admin?: boolean;
	after?: string;
	before?: string;
	build?: string;
	contact?: string;
	database?: boolean;
	debug?: boolean;
	domain?: string | string[];
	errors?: boolean;
	faults?: boolean;
	file?: string;
	filter?: string | (string | number)[];
	format?: string;
	from?: string;
	groupBy?: string;
	id?: string;
	interval?: number;
	ip?: (string | number)[];
	json?: boolean;
	method?: string;
	name?: string;
	nextToken?: string;
	noSecret?: boolean;
	origin?: string;
	output?: string;
	path?: string;
	port?: number;
	pattern?: (string | number)[];
	postSync?: boolean;
	replace?: (string | number)[];
	responseTime?: string;
	rest?: boolean;
	resume?: string;
	role?: string;
	search?: string;
	slow?: number;
	status?: string | (string | number)[];
	tables?: (string | number)[];
	tail?: boolean;
	type?: string;
	uploads?: boolean;
	uploadsPath?: string;
	urlContains?: string;
	useMydumper?: boolean;
	value?: string;
	valueStdin?: boolean;
	verbose?: number;
	vulnerabilities?: boolean;
	yes?: boolean;
}
// Each subcommand extends the parser with its own options at runtime.
export interface CommandDefinition {
	command: string | string[];
	describe?: string | false;
	builder?: (parser: CommandBuilder) => CommandBuilder | void | Promise<CommandBuilder | void>;
	handler?: (args: CliArguments) => unknown;
}
/** The CLI loads command modules dynamically and injects config at parse time. */
export interface CommandBuilder {
	command(command: CommandDefinition | CommandDefinition[]): CommandBuilder;
	option(key: string, options: Options): CommandBuilder;
	option(options: Record<string, Options>): CommandBuilder;
	positional(key: string, options: Options): CommandBuilder;
	demandCommand(minimum: number): CommandBuilder;
}
