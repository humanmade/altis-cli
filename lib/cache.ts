import path from 'path';
import Config from './config.ts';

class Cache extends Config {
	static defaults = {};
	constructor() {
		super();
		// Modify the config object to use a different path.
		this.cfg.filePath = path.join(path.dirname(this.cfg.filePath), 'cache.json');
	}
}

export default Cache;
