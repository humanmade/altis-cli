import type Vantage from '../lib/vantage.ts';
import type { InstanceMaintenanceResponse, Variable } from '../lib/types/api.ts';
import type { TraceSummary } from '../lib/types/xray.ts';

declare const api: Vantage;
declare const id: string;
const path = `/api/stack/instances/${id}/maintenance` as const;
const read: Promise<InstanceMaintenanceResponse> = api.request(path);
const write: Promise<InstanceMaintenanceResponse> = api.request(path, { method: 'PATCH', body: { contacts: [{ email: 'ops@example.com' }] } });
const variable: Promise<Variable> = api.request(`stack/applications/${id}/variables/app/name`, { method: 'PUT', body: { value: 'value' } });
const summaries: Promise<TraceSummary[]> = api.request(`stack/applications/${id}/xray/traces/summaries`);
// @ts-expect-error The singular contact payload is not the backend contract.
api.request(path, { method: 'PATCH', body: { contact: 'ops@example.com' } });
// @ts-expect-error A maintenance update must supply contacts.
api.request(path, { method: 'PATCH' });
// @ts-expect-error GET cannot have a body.
api.request(path, { body: { contacts: [] } });
// @ts-expect-error Maintenance does not support DELETE.
api.request(path, { method: 'DELETE' });
// @ts-expect-error Serialized bodies bypass type checking and are not accepted.
api.request(path, { method: 'PATCH', body: JSON.stringify({ contacts: [] }) });
// @ts-expect-error Query keys are checked against the endpoint contract.
api.request(path, { query: { include_auth: true } });
// @ts-expect-error Unknown paths cannot silently fall back to an untyped request.
api.request('stack/does-not-exist');
// @ts-expect-error Extra segments do not match a dynamic instance id.
api.request('stack/instances/foo/unknown');
// @ts-expect-error A POST-only endpoint requires an explicit method.
api.request(`stack/applications/${id}/cli/sessions`);
// @ts-expect-error Raw response access preserves the same body contract.
api.requestRaw(path, { method: 'PATCH', body: { contact: 'ops@example.com' } });
// @ts-expect-error Commands cannot call the untyped transport.
api.fetch(path);
void [read, write, variable, summaries];

// @ts-expect-error Variable types are limited to the backend enum.
api.request(`stack/applications/${id}/variables/invalid`);
// @ts-expect-error An uploads import uses path, not uploads_path.
api.request(`stack/applications/${id}/import-uploads`, { method: 'POST', body: { from_application: 'other', uploads_path: 'sites/2' } });
// @ts-expect-error Database-only options are not part of an uploads import.
api.request(`stack/applications/${id}/import-uploads`, { method: 'POST', body: { from_application: 'other', tables: [] } });

// @ts-expect-error Query parameters belong in the typed query object.
api.request('stack/instances/example?unknown=true');
declare const mixedPath: 'stack/instances' | 'stack/not-a-route';
// @ts-expect-error Every member of a union must be a registered path.
api.request(mixedPath);

// @ts-expect-error The backend calls this query parameter search.
api.request(`stack/applications/${id}/logs/php`, { query: { filterPattern: 'error' } });
// @ts-expect-error Status filters are not supported by PHP logs.
api.request(`stack/applications/${id}/logs/php`, { query: { status: ['fail'] } });
