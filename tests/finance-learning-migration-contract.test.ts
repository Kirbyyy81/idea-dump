import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const migrationName = '20260901075657_observable_finance_learning.sql';
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', migrationName), 'utf8');
const legacyMigration = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20260809063202_learn_finance_reference_corrections.sql'
), 'utf8');

function functionBody(name: string) {
    const startPattern = new RegExp(`create function public\\.${name.replaceAll('.', '\\.') }\\(`);
    const match = startPattern.exec(migration);
    expect(match, `Missing function ${name}`).not.toBeNull();
    const start = match?.index ?? -1;
    const end = migration.indexOf('\n$function$;', start);
    expect(end, `Unterminated function ${name}`).not.toBe(-1);
    return migration.slice(start, end);
}

describe('Finance observable learning migration', () => {
    it('creates the run, user summary, template, and evidence records', () => {
        for (const table of [
            'finance_learning_runs',
            'finance_learning_run_user_summaries',
            'finance_parser_templates',
            'finance_template_evidence',
        ]) {
            expect(migration).toContain(`create table public.${table}`);
            expect(migration).toContain(`alter table public.${table} enable row level security;`);
            expect(migration).toMatch(new RegExp(`create policy server_only_deny on public\\.${table}`));
        }
    });

    it('keeps raw learning data behind the server boundary', () => {
        expect(migration).toMatch(/revoke all on table[\s\S]*from public, anon, authenticated, service_role;/);
        expect(migration).toMatch(/grant select on table[\s\S]*to service_role;/);
        expect(migration).not.toMatch(/grant (?:select|insert|update|delete)[\s\S]*to (?:anon|authenticated)/);
        expect(migration).toMatch(
            /grant execute on function public\.finance_learning_summary_v1\(uuid\)[\s\S]*to service_role;/
        );
        expect(migration).not.toMatch(
            /grant execute on function public\.finance_learning_summary_v1\(uuid\)[\s\S]*to (?:anon|authenticated)/
        );
    });

    it('enforces tenant-safe evidence ownership and indexed foreign keys', () => {
        expect(migration).toContain('finance_candidate_transactions_id_user_id_key unique (id, user_id)');
        expect(migration).toContain('finance_corrections_id_user_id_key unique (id, user_id)');
        expect(migration).toContain('foreign key (template_id, user_id, algorithm_version)');
        expect(migration).toContain('foreign key (correction_id, user_id)');
        expect(migration).toContain('foreign key (candidate_id, user_id)');
        expect(migration).toContain('foreign key (intake_item_id, user_id)');
        expect(migration).toContain('finance_template_evidence_template_user_idx');
        expect(migration).toContain('finance_template_evidence_user_idx');
        expect(migration).toContain('finance_template_evidence_correction_user_idx');
        expect(migration).toContain('finance_template_evidence_candidate_user_idx');
        expect(migration).toContain('finance_template_evidence_intake_user_idx');
        expect(migration).toContain('finance_parser_templates_target_source_user_idx');
        expect(migration).toContain('finance_parser_templates_scope_source_user_idx');
    });

    it('persists the complete phase zero template contract', () => {
        expect(migration).toContain("algorithm_version = 1");
        expect(migration).toContain('pg_catalog.octet_length(configuration::text) <= 4096');
        expect(migration).toContain("field_name = 'source_id'");
        expect(migration).toContain('target_source_id is not null');
        expect(migration).toContain("field_name <> 'source_id'");
        expect(migration).toContain('scope_source_id is not null');
        expect(migration).toContain('active_scope_count >= 20');
        expect(migration).toContain('new.evidence_count < 3');
        expect(migration).toContain('new.contradiction_count > 0');
        expect(migration).toContain("new.precision is distinct from 1::numeric");
        expect(migration).toContain('finance_parser_templates_active_lookup_idx');
        expect(migration).toContain('finance_parser_templates_shadow_lookup_idx');
        expect(migration).toContain("old.status = 'proposed' and new.status in ('shadow', 'rejected')");
        expect(migration).toContain("old.status = 'disabled' and new.status = 'shadow'");
        expect(migration).not.toContain("old.status = 'proposed' and new.status = 'active'");
        expect(migration).not.toContain("old.status = 'disabled' and new.status = 'active'");
    });

    it('rejects executable regex and validates bounded configuration shapes', () => {
        const validator = functionBody('finance_parser_template_configuration_is_valid');
        expect(validator).toContain("configuration_type = 'allowlisted_regex_capture'");
        expect(validator).toContain("'reference_token'");
        expect(validator).toContain("'myr_amount'");
        expect(validator).not.toMatch(/configuration\s*->>\s*'regex'/);
        expect(validator).toContain("p_configuration ->> 'max_lines' ~ '^[1-3]$'");
        expect(validator).toContain('phrase_count between 1 and 10');
        expect(validator).toContain('between 1 and 120');
        expect(validator).not.toContain("('expense', 'income', 'transfer')");
        expect(migration).toContain("configuration ->> 'pattern_id' = 'myr_amount' and field_name = 'amount'");
    });

    it('makes learning refreshes bounded, retry-safe, observable, and retained for 90 days', () => {
        const refresh = functionBody('finance_refresh_rule_suggestions');
        expect(refresh).toContain("set statement_timeout = '90s'");
        expect(refresh).toContain("pg_catalog.hashtextextended('finance_refresh_rule_suggestions', 1)");
        expect(refresh).toContain('on conflict (invocation_id) do nothing');
        expect(refresh).toContain('finance_refresh_rule_suggestions_legacy_v1()');
        expect(refresh).toContain("set status = 'succeeded'");
        expect(refresh).toContain("set status = 'failed'");
        expect(refresh).toContain("interval '90 days'");
        expect(refresh).not.toContain('returned_sqlstate = failure_code');
        expect(migration).toContain('legacy_inserted_count');
        expect(migration).toContain('finance_learning_reason_counts_are_valid(reason_counts)');
        const reasonValidator = functionBody('finance_learning_reason_counts_are_valid');
        expect(reasonValidator).toContain("'insufficient_evidence'");
        expect(reasonValidator).toContain("'contradiction'");
        expect(reasonValidator).toContain("reasons.count_value::text !~ '^[0-9]+$'");
    });

    it('preserves the cron command and every legacy reference transformation', () => {
        expect(migration).toContain(
            'alter function public.finance_refresh_rule_suggestions()\n  rename to finance_refresh_rule_suggestions_legacy_v1;'
        );
        expect(migration).not.toContain('cron.schedule');
        expect(legacyMigration).toContain("'strip_prefix'::text");
        expect(legacyMigration).toContain("'strip_suffix'::text");
        expect(legacyMigration).toContain("'digits_only'::text");
        expect(legacyMigration).toContain("'alphanumeric_only'::text");
    });

    it('returns only bounded aggregate settings data', () => {
        const summary = functionBody('finance_learning_summary_v1');
        expect(summary).toContain("'availability', 'never_run'");
        expect(summary).toContain("'availability', 'available'");
        expect(summary).toContain("'active_metrics'");
        expect(summary).toContain("'recent_outcomes'");
        expect(summary).toContain('limit 5');
        for (const privateField of [
            'ocr_text',
            'original_filename',
            'previous_value',
            'corrected_value',
            'configuration',
        ]) {
            expect(summary).not.toContain(privateField);
        }
    });
});
