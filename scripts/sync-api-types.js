import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const frontend = process.argv[2];
if (!frontend) {
	throw new Error('Usage: npm run sync-api-types -- /path/to/vantage/frontend');
}
// Read both first so a missing source cannot leave a half-updated snapshot.
const snapshots = [
	['src/types/rest-api.ts', 'rest-api.ts'],
	['src/components/XRayTrace/types.ts', 'xray-segments.ts'],
].map(([source, destination]) => ({
	destination,
	content: readFileSync(resolve(frontend, source), 'utf8'),
}));
for (const { destination, content } of snapshots) {
	writeFileSync(new URL(`../lib/types/${destination}`, import.meta.url), content);
}
