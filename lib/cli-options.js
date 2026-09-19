const informationalOptions = new Set(['--help', '-h', '--version', '-v']);

export const hasInformationalOption = args =>
	args.some(arg => informationalOptions.has(arg));

export const normalizeInformationalOptions = args =>
	args.map(arg => {
		if (arg === '-h') {
			return '--help';
		}
		if (arg === '-v') {
			return '--version';
		}
		return arg;
	});
