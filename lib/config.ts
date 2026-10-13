import type Cache from './cache.ts';
import appCfg from 'application-config';

export const CFG_NAME = 'altis-cli';

class Config {
	static defaults: Record<string, unknown> = { didSetup: false, github: {} };
	cfg: ReturnType<typeof appCfg>;
	cache!: Cache;
	data!: Record<string, unknown>;
	get defaults(): Record<string, unknown> { return (this.constructor as typeof Config).defaults; }

	constructor() {
		this.cfg = appCfg(CFG_NAME);
	}

	get path() {
		return this.cfg.filePath;
	}

	load() {
		if (this.data) {
			return Promise.resolve(this.data);
		}
		return new Promise<Record<string, unknown>>((resolve, reject) => {
			this.cfg.read((err, data) => {
				if (err) {
					reject(err);
				} else {
					this.data = data;
					resolve(data);
				}
			});
		});
	}

	save() {
		return new Promise<void>((resolve, reject) => {
			this.cfg.write(this.data, err => {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}

	reset() {
		this.data = this.defaults;
		return this.save();
	}

	get<T = unknown>(key: string): T | undefined {
		return (this.data[key] || this.defaults[key]) as T | undefined;
	}

	set(key: string | Record<string, unknown>, value?: unknown) {
		if (typeof key !== "string") {
			this.data = Object.assign({}, this.data, key);
		} else {
			this.data[key] = value;
		}
		return this.save();
	}
}


export default Config;
