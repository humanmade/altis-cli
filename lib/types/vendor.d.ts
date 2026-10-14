declare module 'application-config' {
	interface ApplicationConfig {
		filePath: string;
		read(callback: (error: NodeJS.ErrnoException | null, data: Record<string, unknown>) => void): void;
		write(data: Record<string, unknown>, callback: (error: NodeJS.ErrnoException | null) => void): void;
	}
	export default function applicationConfig(name: string): ApplicationConfig;
}
declare module '@humanmade/ssm' {
	import { EventEmitter } from 'node:events';
	class Session extends EventEmitter {
		constructor(url: string, id: string, token: string);
		write(data: string): void;
		close(): void;
		ping(): void;
		setSize(columns: number, rows: number): void;
	}
	const pkg: { default: typeof Session };
	export default pkg;
}
declare module 'node-cmd' {
	const cmd: { run(command: string, callback?: (error: Error | null, data: string, stderr: string) => void): void; runSync(command: string): { data: string; err: Error | null; stderr: string } };
	export default cmd;
}
declare module 'inquirer/lib/prompts/input.js';
declare module 'inquirer/lib/utils/events.js';

declare module 'unused-filename' { export default function unusedFilename(path: string): Promise<string>; }
declare module 'indent-string' { export default function indentString(input: string, count?: number, options?: { indent?: string; includeEmptyLines?: boolean }): string; }
