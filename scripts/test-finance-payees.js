const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.resolve(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '20260809143246_add_finance_payees.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8');
const duplicateSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'lib', 'finance', 'transactions', 'duplicates.ts'),
    'utf8'
);
const repositorySource = fs.readFileSync(
    path.resolve(__dirname, '..', 'lib', 'finance', 'core', 'repository.ts'),
    'utf8'
);

function functionBody(name) {
    const start = sql.indexOf(`create function ${name}(`);
    assert.notEqual(start, -1, `Missing function ${name}`);
    const end = sql.indexOf('\n$function$;', start);
    assert.notEqual(end, -1, `Unterminated function ${name}`);
    return sql.slice(start, end);
}

assert.match(sql, /create table public\.dim_finance_payees/);
assert.match(sql, /unique \(id, user_id\)/);
assert.match(sql, /unique \(user_id, normalized_name\)/);
assert.match(sql, /finance_normalize_payee_key\(name\)/);
assert.match(sql, /alter table public\.dim_finance_payees enable row level security/);
assert.match(sql, /revoke all on table public\.dim_finance_payees from public, anon, authenticated/);
assert.match(sql, /grant select, insert, update, delete on table public\.dim_finance_payees to service_role/);

assert.match(sql, /add column payee_id uuid,\s*add column recipient_reference text/s);
assert.doesNotMatch(sql, /add column payee_id uuid[^,;]*default/i);
assert.doesNotMatch(sql, /add column recipient_reference text[^,;]*default/i);
assert.doesNotMatch(sql, /update public\.finance_transactions[\s\S]*set merchant/i);
assert.match(sql, /foreign key \(payee_id, user_id\)[\s\S]*dim_finance_payees\(id, user_id\)/);
assert.match(sql, /recipient_reference = pg_catalog\.btrim\(recipient_reference\)/);
assert.match(sql, /char_length\(recipient_reference\) between 1 and 200/);
assert.match(sql, /finance_transactions_payee_user_idx/);

const resolvePayee = functionBody('finance_private.finance_resolve_payee_v1');
assert.match(resolvePayee, /on conflict \(user_id, normalized_name\)/);
assert.match(resolvePayee, /is_archived = false/);

const createManual = functionBody('public.finance_create_manual_transaction_v1');
assert.match(createManual, /p_manual_idempotency_key/);
assert.match(createManual, /finance_resolve_payee_v1\(p_user_id, p_payee_name\)/);

for (const name of [
    'public.finance_create_manual_transaction_v1',
    'public.finance_confirm_candidate_v2',
    'public.finance_update_transaction_v2',
]) {
    assert.match(sql, new RegExp(`grant execute on function ${name.replaceAll('.', '\\.')}`));
    assert.doesNotMatch(
        sql,
        new RegExp(`grant execute on function ${name.replaceAll('.', '\\.')}[\\s\\S]*?to (?:anon|authenticated)`)
    );
}

const confirm = functionBody('public.finance_confirm_candidate_v2');
const update = functionBody('public.finance_update_transaction_v2');
assert.match(confirm, /was_already_accepted/);
assert.match(confirm, /if was_already_accepted then\s+return confirmation/s);
assert.match(confirm, /'payee_name'::text/);
assert.match(confirm, /'recipient_reference'::text/);
assert.doesNotMatch(confirm, /'payee_id'::text/);
assert.match(update, /to_jsonb\(previous_payee_name\)/);
assert.match(update, /to_jsonb\(corrected_payee_name\)/);
assert.match(update, /to_jsonb\(previous_row\.recipient_reference\)/);
assert.match(update, /set payee_id = resolved_payee_id/);
assert.doesNotMatch(update, /delete from public\.dim_finance_payees/);

assert.doesNotMatch(duplicateSource, /recipient_reference/);
assert.match(repositorySource, /recipient_reference\.ilike/);
assert.match(repositorySource, /finance_payee:dim_finance_payees/);

console.log('Finance payee migration contract tests passed');
