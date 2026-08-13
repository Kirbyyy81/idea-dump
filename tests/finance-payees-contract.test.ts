import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const sql = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20260809143246_add_finance_payees.sql'
), 'utf8');
const notesSql = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20260813034905_merge_recipient_reference_into_notes.sql'
), 'utf8');
const duplicateSource = fs.readFileSync(path.join(
    root,
    'lib',
    'finance',
    'transactions',
    'duplicates.ts'
), 'utf8');
const repositorySource = fs.readFileSync(path.join(
    root,
    'lib',
    'finance',
    'core',
    'repository.ts'
), 'utf8');

function functionBody(name: string, source = sql) {
    const start = source.indexOf(`create function ${name}(`);
    expect(start, `Missing function ${name}`).not.toBe(-1);
    const end = source.indexOf('\n$function$;', start);
    expect(end, `Unterminated function ${name}`).not.toBe(-1);
    return source.slice(start, end);
}

describe('Finance payee migration contract', () => {
    it('creates and protects the payee dimension', () => {
        expect(sql).toMatch(/create table public\.dim_finance_payees/);
        expect(sql).toMatch(/unique \(id, user_id\)/);
        expect(sql).toMatch(/unique \(user_id, normalized_name\)/);
        expect(sql).toMatch(/finance_normalize_payee_key\(name\)/);
        expect(sql).toMatch(/alter table public\.dim_finance_payees enable row level security/);
        expect(sql).toMatch(
            /revoke all on table public\.dim_finance_payees from public, anon, authenticated/
        );
        expect(sql).toMatch(
            /grant select, insert, update, delete on table public\.dim_finance_payees to service_role/
        );
    });

    it('adds nullable transaction payee fields with ownership constraints', () => {
        expect(sql).toMatch(/add column payee_id uuid,[\s\S]*add column recipient_reference text/);
        expect(sql).not.toMatch(/add column payee_id uuid[^,;]*default/i);
        expect(sql).not.toMatch(/add column recipient_reference text[^,;]*default/i);
        expect(sql).not.toMatch(/update public\.finance_transactions[\s\S]*set merchant/i);
        expect(sql).toMatch(
            /foreign key \(payee_id, user_id\)[\s\S]*dim_finance_payees\(id, user_id\)/
        );
        expect(sql).toMatch(/recipient_reference = pg_catalog\.btrim\(recipient_reference\)/);
        expect(sql).toMatch(/char_length\(recipient_reference\) between 1 and 200/);
        expect(sql).toMatch(/finance_transactions_payee_user_idx/);
    });

    it('resolves payees safely from service-role transaction functions', () => {
        const resolvePayee = functionBody('finance_private.finance_resolve_payee_v1');
        const createManual = functionBody('public.finance_create_manual_transaction_v1');

        expect(resolvePayee).toMatch(/on conflict \(user_id, normalized_name\)/);
        expect(resolvePayee).toMatch(/is_archived = false/);
        expect(createManual).toMatch(/p_manual_idempotency_key/);
        expect(createManual).toMatch(/finance_resolve_payee_v1\(p_user_id, p_payee_name\)/);

        for (const name of [
            'public.finance_create_manual_transaction_v1',
            'public.finance_confirm_candidate_v2',
            'public.finance_update_transaction_v2',
        ]) {
            const escapedName = name.replaceAll('.', '[.]');
            expect(sql).toMatch(new RegExp(`grant execute on function ${escapedName}`));
            expect(sql).not.toMatch(new RegExp(
                `grant execute on function ${escapedName}[\\s\\S]*?to (?:anon|authenticated)`
            ));
        }
    });

    it('records payee changes without deleting payee records', () => {
        const confirm = functionBody('public.finance_confirm_candidate_v2');
        const update = functionBody('public.finance_update_transaction_v2');

        expect(confirm).toMatch(/was_already_accepted/);
        expect(confirm).toMatch(/if was_already_accepted then[\s\S]*return confirmation/);
        expect(confirm).toMatch(/'payee_name'::text/);
        expect(confirm).toMatch(/'recipient_reference'::text/);
        expect(confirm).not.toMatch(/'payee_id'::text/);
        expect(update).toMatch(/to_jsonb\(previous_payee_name\)/);
        expect(update).toMatch(/to_jsonb\(corrected_payee_name\)/);
        expect(update).toMatch(/to_jsonb\(previous_row\.recipient_reference\)/);
        expect(update).toMatch(/set payee_id = resolved_payee_id/);
        expect(update).not.toMatch(/delete from public\.dim_finance_payees/);
    });

    it('keeps duplicate and repository handling aligned with payee semantics', () => {
        expect(duplicateSource).not.toMatch(/recipient_reference/);
        expect(repositorySource).not.toMatch(/recipient_reference\.ilike/);
        expect(repositorySource).toMatch(/finance_payee:dim_finance_payees/);
    });

    it('moves recipient references into notes and replaces mutation RPCs directly', () => {
        expect(notesSql).toMatch(/update public\.finance_transactions[\s\S]*recipient_reference[\s\S]*E'\\n'/);
        expect(notesSql).toMatch(/payload - 'recipient_reference'/);
        expect(notesSql).toMatch(/drop column recipient_reference/);
        expect(notesSql).toMatch(/drop function public\.finance_create_manual_transaction_v1/);
        expect(notesSql).toMatch(/drop function public\.finance_confirm_candidate_v2/);
        expect(notesSql).toMatch(/drop function public\.finance_update_transaction_v2/);
        expect(notesSql).toMatch(/char_length\(notes\) <= 2500/);

        for (const name of [
            'public.finance_create_manual_transaction_v2',
            'public.finance_confirm_candidate_v3',
            'public.finance_update_transaction_v3',
        ]) {
            const escapedName = name.replaceAll('.', '[.]');
            expect(notesSql).toMatch(new RegExp(`grant execute on function ${escapedName}`));
            expect(notesSql).not.toMatch(new RegExp(
                `grant execute on function ${escapedName}[\\s\\S]*?to (?:anon|authenticated)`
            ));
        }

        const confirmV3 = functionBody('public.finance_confirm_candidate_v3', notesSql);
        const updateV3 = functionBody('public.finance_update_transaction_v3', notesSql);
        expect(confirmV3).toMatch(/candidate_row\.payload -> 'notes'/);
        expect(confirmV3).not.toMatch(/recipient_reference/);
        expect(updateV3).toMatch(/'payee_name'/);
        expect(updateV3).not.toMatch(/recipient_reference/);
        expect(repositorySource).toMatch(/finance_create_manual_transaction_v2/);
        expect(repositorySource).toMatch(/finance_confirm_candidate_v3/);
        expect(repositorySource).toMatch(/finance_update_transaction_v3/);
    });
});
