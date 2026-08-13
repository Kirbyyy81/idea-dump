import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const sql = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20260725081908_add_finance_share_batches.sql'
), 'utf8');
const replacementSql = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20260727030628_replace_active_finance_share_batch.sql'
), 'utf8');
const queuePermissionsSql = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20260727040355_grant_finance_share_queue_permissions.sql'
), 'utf8');

function functionBody(name: string) {
    const start = sql.indexOf(`create function ${name}(`);
    expect(start, `Missing function ${name}`).not.toBe(-1);
    const end = sql.indexOf('\n$function$;', start);
    expect(end, `Unterminated function ${name}`).not.toBe(-1);
    return sql.slice(start, end);
}

function replacementFunctionBody(name: string) {
    const functionPattern = new RegExp(
        `create or replace function ${name.replaceAll('.', '\\.') }\\(`
    );
    const match = functionPattern.exec(replacementSql);
    expect(match, `Missing replacement function ${name}`).not.toBeNull();
    const start = match?.index ?? -1;
    const end = replacementSql.indexOf('\n$function$;', start);
    expect(end, `Unterminated replacement function ${name}`).not.toBe(-1);
    return replacementSql.slice(start, end);
}

describe('Finance share migration contract', () => {
    it('installs the queue extensions and private storage bucket', () => {
        expect(sql).toMatch(/create extension if not exists pgmq;/);
        expect(sql).toMatch(/create extension if not exists pg_net;/);
        expect(sql).toMatch(/create extension if not exists pg_cron with schema pg_catalog;/);
        expect(sql).toMatch(/pgmq\.create\('finance_share_ocr'\)/);
        expect(sql).toMatch(/create schema if not exists finance_private;/);
        expect(sql).toMatch(/'finance-share-batches',[\s\S]*'finance-share-batches',[\s\S]*false,/);
        expect(sql).toMatch(/4194304/);
        expect(sql).toMatch(/array\['image\/jpeg', 'image\/png', 'image\/webp'\]::text\[\]/);
        expect(sql).not.toMatch(/create policy[\s\S]*storage\.objects/i);
    });

    it('binds reservations to client IDs and locks down private tables', () => {
        expect(sql).toMatch(/client_id uuid not null,[\s\S]*unique \(reservation_id, client_id\)/);
        expect(functionBody('finance_private.finance_share_reservation_json_v1')).toMatch(
            /'client_id', items\.client_id/
        );
        expect(functionBody('public.finance_prepare_share_batch_v1')).toMatch(
            /item_client_id := \(file_row ->> 'client_id'\)::uuid/
        );

        for (const table of [
            'finance_share_upload_reservations',
            'finance_share_upload_reservation_items',
            'finance_share_batches',
            'finance_share_batch_items',
        ]) {
            expect(sql).toMatch(new RegExp(
                `alter table finance_private\\.${table} enable row level security;`
            ));
            expect(sql).toMatch(new RegExp(
                `create policy server_only_deny\\s+on finance_private\\.${table}`
            ));
        }
    });

    it('defines every Finance share RPC', () => {
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
            expect(sql).toMatch(new RegExp(`create function public\\.${rpc}\\(`));
        }
    });

    it('leases, retries, and completes queue work safely', () => {
        const claim = functionBody('public.finance_claim_share_queue_item_v1');
        const retry = functionBody('public.finance_retry_share_queue_item_v1');
        const complete = functionBody('public.finance_complete_share_queue_item_v1');
        const activeJson = functionBody('finance_private.finance_share_batch_json_v1');

        expect(claim).toMatch(/from pgmq\.read\('finance_share_ocr', p_lease_seconds, 1\)/);
        expect(claim).not.toMatch(/pgmq\.pop/);
        expect(claim).toMatch(/was_exhausted := item_row\.attempt_count >= 2/);
        expect(claim).toMatch(/'finance_access_revoked'/);
        expect(claim).toMatch(/'processing_version_mismatch'/);
        expect(claim).not.toMatch(/intake_processing_attempt_id = null/);
        expect(retry).not.toMatch(/intake_processing_attempt_id = null/);
        expect(complete).toMatch(
            /intakes\.processing_attempt_id\s*=\s*item_row\.intake_processing_attempt_id/
        );
        expect(complete).not.toMatch(/finance_fail_screenshot_intake_v2/);
        expect(complete).toMatch(/p_image_hash text default null/);
        expect(complete).toMatch(/intake_row\.image_hash is distinct from item_row\.image_hash/);
        expect(complete).toMatch(/image_hash,[\s\S]*original_filename/);
        expect(complete).toMatch(
            /set intake_item_id = intake_row\.id,[\s\S]*image_hash = p_image_hash/
        );
        expect(complete).not.toMatch(
            /p_outcome = 'duplicate'[\s\S]*candidate_row\.id is null and transaction_row\.id is null/
        );
        expect(activeJson).toMatch(/'status', pg_catalog\.upper\(batches\.status\)/);
        expect(activeJson).toMatch(/'status', pg_catalog\.upper\(items\.status\)/);
    });

    it('configures wake-up recovery without hard-coded deployment secrets', () => {
        expect(sql).toMatch(
            /finance_share_render_wake_secret must match FINANCE_QUEUE_WAKE_SECRET/
        );
        expect(sql).not.toMatch(/FINANCE_SHARE_QUEUE_SECRET/);
        expect(sql).toMatch(/select net\.http_post\(/);
        expect(sql).toMatch(/where jobs\.jobname = 'finance-share-queue-recovery'/);
        expect(sql).toMatch(/perform cron\.alter_job\(/);
        expect(sql).not.toMatch(/https:\/\/idea-dump-[^\s']*/);

        const serviceRoleGrants = sql.match(
            /grant execute on function public\.finance_[\s\S]*?\s+to service_role;/g
        ) ?? [];
        expect(serviceRoleGrants.length).toBeGreaterThanOrEqual(8);
        expect(sql).not.toMatch(
            /grant execute on function public\.finance_(?:prepare|commit|get_active|claim|retry|complete|cleanup)_share[\s\S]*?to (?:anon|authenticated)/
        );
    });

    it('replaces active batches deterministically', () => {
        const replacement = replacementFunctionBody(
            'finance_private.finance_replace_share_work_v1'
        );
        const replacementPrepare = replacementFunctionBody(
            'public.finance_prepare_share_batch_v1'
        );
        const replacementActive = replacementFunctionBody(
            'finance_private.finance_share_active_batch_exists_v1'
        );
        const replacementGetActive = replacementFunctionBody(
            'public.finance_get_active_share_batch_v1'
        );

        expect(replacement).toMatch(/pgmq\.delete\('finance_share_ocr'/);
        expect(replacement).toMatch(/'share_batch_replaced'/);
        expect(replacement).toMatch(/status = 'cleaning_up'/);
        expect(replacement).toMatch(/processing_lease_expires_at = null/);
        expect(replacement).toMatch(/candidate_row\.status = 'accepted'/);
        expect(replacement).toMatch(/candidate_row\.status = 'pending'/);
        expect(replacement).toMatch(
            /cleanup_lease_expires_at = replacement_now - interval '1 second'/
        );
        expect(replacementPrepare).toMatch(
            /perform finance_private\.finance_replace_share_work_v1\(p_user_id\)/
        );
        expect(replacementPrepare).not.toMatch(
            /FINANCE_SHARE_(?:ACTIVE_BATCH_EXISTS|UPLOAD_IN_PROGRESS)/
        );
        expect(replacementActive).toMatch(/batches\.status in \('queued', 'processing'\)/);
        expect(replacementGetActive).toMatch(/batches\.status in \('queued', 'processing'\)/);
        expect(fs.readFileSync(path.join(
            root,
            'lib',
            'finance',
            'share',
            'server.ts'
        ), 'utf8')).not.toMatch(/requires a product decision/);
    });

    it('keeps queue tables service-role only', () => {
        expect(queuePermissionsSql).toMatch(
            /grant select, insert, update, delete\s+on table pgmq\.q_finance_share_ocr\s+to service_role;/
        );
        expect(queuePermissionsSql).toMatch(
            /grant usage, select\s+on sequence pgmq\.q_finance_share_ocr_msg_id_seq\s+to service_role;/
        );
        expect(queuePermissionsSql).not.toMatch(
            /grant[\s\S]*\s+to (?:public|anon|authenticated);/
        );
    });
});
