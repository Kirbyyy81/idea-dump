import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const logRoute = read('app/api/logs/[id]/route.ts');
const identity = read('lib/auth/resolveIdentity.ts');
const types = read('lib/types.ts');
const openapi = read('lib/openapi.ts');
const logApiTools = read('app/logs/api-tools/page.tsx');
const logPrd = read('document/PRD_002.md');
const ticketsRoute = read('app/api/tickets/route.ts');

assert.equal(
  /allow_human_overwrite/.test(logRoute),
  false,
  'PATCH /api/logs/[id] must not accept request-controlled allow_human_overwrite'
);
assert.equal(
  /allow_human_overwrite/.test(types + openapi + logApiTools + logPrd),
  false,
  'Public types and API docs must not advertise allow_human_overwrite'
);
assert.match(
  identity,
  /export function canModifyLog\(\s*identity: ResolvedIdentity,\s*logSource: 'agent' \| 'human'\s*\): boolean/,
  'canModifyLog should only depend on server-known identity and log source'
);
assert.equal(
  /allowHumanOverwrite|return allow_human_overwrite|return allowHumanOverwrite/.test(identity),
  false,
  'canModifyLog must not trust an overwrite flag'
);
const canModifyLogBody = identity.match(/export function canModifyLog\([\s\S]*?\r?\n}\r?\n/)?.[0] ?? '';
assert.match(
  canModifyLogBody,
  /if \(logSource === 'agent'\) \{\s*return true;\s*\}/,
  'agents may update agent-created logs'
);
assert.match(
  canModifyLogBody,
  /return false;/,
  'agents may not update human-created logs'
);

assert.match(
  ticketsRoute,
  /const projectId = body\.project_id\.trim\(\);[\s\S]*?\.from\('projects'\)\s*\.select\('id'\)\s*\.eq\('id', projectId\)\s*\.eq\('user_id', session\.user\.id\)\s*\.maybeSingle\(\)/,
  'POST /api/tickets must verify the submitted project belongs to the current user'
);
assert.match(
  ticketsRoute,
  /if \(!project\) \{\s*return NextResponse\.json\(\{ error: 'Project not found' \}, \{ status: 404 \}\);\s*\}/s,
  'POST /api/tickets must reject projects outside the creator scope'
);

console.log('Security finding validation passed');
