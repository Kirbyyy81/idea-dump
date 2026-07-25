const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.resolve(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '20260724075727_add_finance_share_batches.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8');

function functionBody(name) {
    const start = sql.indexOf(`create function ${name}(`);
    assert.notEqual(start, -1, `Missing function ${name}`);
    const end = sql.indexOf('\n$function$;', start);
    assert.notEqual(end, -1, `Unterminated function ${name}`);
    return sql.slice(start, end);
}

assert.match(sql, /create extension if not exists pgmq;/);
assert.match(sql, /create extension if not exists pg_net;/);
assert.match(sql, /create extension if not exists pg_cron with schema pg_catalog;/);
assert.match(sql, /pgmq\.create\('finance_share_ocr'\)/);
assert.match(sql, /create schema if not exists finance_private;/);

assert.match(sql, /'finance-share-batches',\s*'finance-share-batches',\s*false,/s);
assert.match(sql, /4194304/);
assert.match(sql, /array\['image\/jpeg', 'image\/png', 'image\/webp'\]::text\[\]/);
assert.doesNotMatch(sql, /create policy[\s\S]*storage\.objects/i);

assert.match(
    sql,
    /client_id uuid not null,[\s\S]*unique \(reservation_id, client_id\)/
);
assert.match(
    functionBody('finance_private.finance_share_reservation_json_v1'),
    /'client_id', items\.client_id/
);
assert.match(
    functionBody('public.finance_prepare_share_batch_v1'),
    /item_client_id := \(file_row ->> 'client_id'\)::uuid/
);

for (const table of [
    'finance_share_upload_reservations',
    'finance_share_upload_reservation_items',
    'finance_share_batches',
    'finance_share_batch_items',
]) {
    assert.match(
        sql,
        new RegExp(`alter table finance_private\\.${table} enable row level security;`)
    );
    assert.match(
        sql,
        new RegExp(
            `create policy server_only_deny\\s+on finance_private\\.${table}`
        )
    );
}

for (const rpc of [
    'finance_prepare_share_batch_v1',
    'finance_get_share_upload_reservation_v1',
    'finance_commit_share_batch_v1',
    'finance_get_active_share_batch_v1',
    'finance_claim_share_queue_item_v1',
    'finance_retry_share_queue_item_v1',
    'finance_complete_share_queue_item_v1',
    'finance_cleanup_share_batch_v1',
]) {
    assert.match(sql, new RegExp(`create function public\\.${rpc}\\(`));
}

const claim = functionBody('public.finance_claim_share_queue_item_v1');
const retry = functionBody('public.finance_retry_share_queue_item_v1');
const complete = functionBody('public.finance_complete_share_queue_item_v1');
const activeJson = functionBody('finance_private.finance_share_batch_json_v1');
assert.match(claim, /from pgmq\.read\('finance_share_ocr', p_lease_seconds, 1\)/);
assert.doesNotMatch(claim, /pgmq\.pop/);
assert.match(claim, /was_exhausted := item_row\.attempt_count >= 2/);
assert.match(claim, /'finance_access_revoked'/);
assert.match(claim, /'processing_version_mismatch'/);
assert.doesNotMatch(claim, /intake_processing_attempt_id = null/);
assert.doesNotMatch(retry, /intake_processing_attempt_id = null/);
assert.match(
    complete,
    /intakes\.processing_attempt_id\s*=\s*item_row\.intake_processing_attempt_id/
);
assert.doesNotMatch(complete, /finance_fail_screenshot_intake_v2/);
assert.match(complete, /p_image_hash text default null/);
assert.match(complete, /intake_row\.image_hash is distinct from item_row\.image_hash/);
assert.match(complete, /image_hash,\s*original_filename/s);
assert.match(complete, /set intake_item_id = intake_row\.id,[\s\S]*image_hash = p_image_hash/);
assert.doesNotMatch(
    complete,
    /p_outcome = 'duplicate'[\s\S]*candidate_row\.id is null and transaction_row\.id is null/
);
assert.match(activeJson, /'status', pg_catalog\.upper\(batches\.status\)/);
assert.match(activeJson, /'status', pg_catalog\.upper\(items\.status\)/);

assert.match(sql, /finance_share_render_wake_secret must match FINANCE_QUEUE_WAKE_SECRET/);
assert.doesNotMatch(sql, /FINANCE_SHARE_QUEUE_SECRET/);
assert.match(sql, /select net\.http_post\(/);
assert.match(sql, /where jobs\.jobname = 'finance-share-queue-recovery'/);
assert.match(sql, /perform cron\.alter_job\(/);
assert.doesNotMatch(sql, /https:\/\/idea-dump-[^\s']*/);

const serviceRoleGrants = sql.match(
    /grant execute on function public\.finance_[\s\S]*?\s+to service_role;/g
) || [];
assert.ok(serviceRoleGrants.length >= 8, 'Every public share RPC must grant service_role');
assert.doesNotMatch(
    sql,
    /grant execute on function public\.finance_(?:prepare|commit|get_active|claim|retry|complete|cleanup)_share[\s\S]*?to (?:anon|authenticated)/
);

console.log('Finance share migration contract tests passed');
