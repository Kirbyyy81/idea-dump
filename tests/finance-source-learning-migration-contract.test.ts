import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const migrationName = '20260901103000_learn_finance_ocr_sources.sql';
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', migrationName), 'utf8');

function functionBody(name: string) {
    const match = new RegExp(`create function public\\.${name}\\(`).exec(migration);
    expect(match, `Missing function ${name}`).not.toBeNull();
    const start = match?.index ?? -1;
    const end = migration.indexOf('\n$function$;', start);
    expect(end, `Unterminated function ${name}`).not.toBe(-1);
    return migration.slice(start, end);
}

describe('Finance source-template learning migration', () => {
    it('extracts only bounded, privacy-safe source phrases', () => {
        const sanitizer = functionBody('finance_safe_source_candidate_phrase');
        const extractor = functionBody('finance_source_candidate_phrases');
        expect(sanitizer).toContain("'[0-9]+([.,:/-][0-9]+)*'");
        expect(sanitizer).toContain("normalized_phrase ~ '[0-9]'");
        expect(sanitizer).toContain('amount|balance|reference|ref|account|recipient|date|time|notes?');
        expect(sanitizer).toContain('between 3 and 120');
        expect(extractor).toContain("pg_catalog.left(coalesce(p_ocr_text, ''), 20000)");
        expect(extractor).toContain('200');
        expect(extractor).toContain("location := 'filename'");
        expect(extractor).toContain('filename_tokens[token_number:token_number + token_window - 1]');
        expect(extractor).toContain("location := 'header'");
        expect(extractor).toContain("location := 'footer'");
    });

    it('generates user-owned candidates from confirmed source corrections and configured aliases', () => {
        const refresh = functionBody('finance_refresh_source_templates_v1');
        expect(refresh).toContain("corrections.field_name = 'source_id'");
        expect(refresh).toContain("transactions.status = 'confirmed'");
        expect(refresh).toContain('sources.filename_aliases');
        expect(refresh).toContain('sources.ocr_aliases');
        expect(refresh).toContain('having pg_catalog.count(distinct extracted.transaction_id) >= 3');
        expect(refresh).toContain('bounded.candidate_rank <= 20');
        expect(refresh).toContain("'source_phrase:' || pg_catalog.md5");
        expect(refresh).toContain('on conflict (user_id, template_key, algorithm_version, template_version) do nothing');
    });

    it('backtests without mutating historical Finance records', () => {
        const refresh = functionBody('finance_refresh_source_templates_v1');
        expect(refresh).toContain("candidates.status = 'accepted'");
        expect(refresh).toContain('candidates.confirmed_transaction_id');
        expect(refresh).toContain("then 'supported'");
        expect(refresh).toContain("else 'contradicted'");
        expect(refresh).toContain('insert into public.finance_template_evidence');
        expect(refresh).toContain('intakes.source_detection_signals');
        expect(refresh).toContain("signals.value ->> 'template_id' = templates.id::text");
        expect(refresh).toContain('on conflict (template_id, candidate_id) where candidate_id is not null');
        expect(refresh).not.toMatch(/update public\.finance_(?:candidate_transactions|transactions|intake_items)/);
    });

    it('moves eligible candidates only to shadow and handles contradictions safely', () => {
        const refresh = functionBody('finance_refresh_source_templates_v1');
        expect(refresh).toContain("set status = 'shadow'");
        expect(refresh).not.toContain("set status = 'active'");
        expect(refresh).toContain('templates.evidence_count >= 3');
        expect(refresh).toContain('templates.contradiction_count = 0');
        expect(refresh).toContain('templates.precision = 1::numeric');
        expect(refresh).toContain('20 - eligible.runtime_count');
        expect(refresh).toContain("set status = 'disabled'");
        expect(refresh).toContain("set status = 'rejected'");
        expect(refresh).toContain("'source_archived'");
        expect(refresh).toContain("'contradiction'");
    });

    it('keeps the daily refresh idempotent and cron-compatible', () => {
        const refresh = functionBody('finance_refresh_rule_suggestions');
        expect(migration).toContain('source_learning_completed_at timestamp with time zone');
        expect(migration).toContain(
            'alter function public.finance_refresh_rule_suggestions(uuid)\n  rename to finance_refresh_rule_suggestions_phase_one_v1;'
        );
        expect(refresh).toContain("set statement_timeout = '90s'");
        expect(refresh).toContain("pg_catalog.hashtextextended('finance_refresh_rule_suggestions', 1)");
        expect(refresh).toContain('run_row.source_learning_completed_at is not null');
        expect(refresh).toContain('finance_refresh_rule_suggestions_phase_one_v1(p_invocation_id)');
        expect(refresh).toContain("failure_stage = 'source_template_refresh'");
        expect(migration).not.toContain('cron.schedule');
    });

    it('adds supporting indexes and exposes no new browser or service mutation grant', () => {
        expect(migration).toContain('finance_corrections_source_learning_idx');
        expect(migration).toContain('finance_candidates_confirmed_learning_idx');
        expect(migration).toMatch(
            /revoke execute on function public\.finance_refresh_source_templates_v1\(uuid\)[\s\S]*from public, anon, authenticated, service_role;/
        );
        expect(migration).not.toMatch(/grant (?:insert|update|delete|execute)[\s\S]*to (?:anon|authenticated|service_role)/);
    });
});
