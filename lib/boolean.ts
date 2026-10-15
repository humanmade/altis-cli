/** Parse explicit boolean values without treating non-empty strings as true. */
export function parseBoolean(value: string): boolean {
	switch (value.trim().toLowerCase()) {
		case 'true': case '1': case 'yes': case 'on': return true;
		case 'false': case '0': case 'no': case 'off': return false;
		default: throw new Error(`Invalid boolean "${value}". Use true/false, 1/0, yes/no, or on/off.`);
	}
}
