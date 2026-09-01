import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260901113000_learn_finance_ocr_critical_fields.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');

describe('Finance critical-field learning migration', () => {
    it('keeps learned candidates source-scoped, privacy-safe, and shadow-only', () => {
        expect(sql).toContain("'field:' || pg_catalog.md5");
        expect(sql).toContain("bounded.source_id");
        expect(sql).toContain("'same_line_label'");
        expect(sql).toContain("'next_non_empty_line'");
        expect(sql).toContain("templates.status = 'proposed'");
        expect(sql).toContain("set status = 'shadow'");
        expect(sql).not.toMatch(/set status = 'active'/i);
        expect(sql).toContain("'label', safe_label");
    });

    it('requires independent evidence, bounded evaluation, and perfect precision', () => {
        expect(sql).toContain('count(distinct extracted.transaction_id) >= 3');
        expect(sql).toContain('templates.evidence_count >= 3');
        expect(sql).toContain('pg_catalog.least(5, reviewed_totals.reviewed_count)');
        expect(sql).toContain('templates.contradiction_count = 0');
        expect(sql).toContain('templates.precision = 1::numeric');
    });

    it('preserves idempotent cron composition and bounded execution', () => {
        expect(sql).toContain('critical_field_learning_completed_at');
        expect(sql).toContain('finance_refresh_rule_suggestions_phase_two_v1');
        expect(sql).toContain("set statement_timeout = '90s'");
        expect(sql).toContain("hashtextextended('finance_refresh_rule_suggestions', 1)");
        expect(sql).toContain("failure_stage = 'critical_field_template_refresh'");
    });

    it('keeps helper execution unavailable to browser and service roles', () => {
        expect(sql).toContain(
            'revoke execute on function public.finance_refresh_critical_field_templates_v1(uuid)',
        );
        expect(sql).toContain('from public, anon, authenticated, service_role;');
    });
});
