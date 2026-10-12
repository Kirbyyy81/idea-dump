import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration = readFileSync(join(root, 'supabase/migrations/20261008025952_remove_legacy_finance_learning_tables.sql'), 'utf8');
const removedNames = /finance_rule_suggestions|finance_field_learning_rules|finance_accept_rule_suggestion|finance_refresh_rule_suggestions_(?:phase_one_v1|phase_two_v1|legacy_v1)|Finance(?:Ocr)?FieldLearningRule|FinanceRuleSuggestion|toFinanceRuleSuggestionView|\/api\/finance\/rule-suggestions/;

function runtimeFiles(directory: string): string[] {
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const file = join(directory, entry.name);
        if (entry.isDirectory()) return runtimeFiles(file);
        return /\.(?:tsx?|m?js)$/.test(entry.name) ? [file] : [];
    });
}

describe('legacy Finance cleanup', () => {
    it('removes empty tables and obsolete RPCs without cascading or replacement stubs', () => {
        expect(migration).toContain('lock table public.finance_rule_suggestions, public.finance_field_learning_rules in access exclusive mode;');
        expect(migration).toContain('Legacy Finance tables must be empty before removal');
        for (const table of ['finance_rule_suggestions', 'finance_field_learning_rules']) {
            expect(migration).toContain(`drop table public.${table} restrict;`);
        }
        for (const signature of [
            'finance_accept_rule_suggestion(uuid, uuid)',
            'finance_refresh_rule_suggestions_phase_two_v1(uuid)',
            'finance_refresh_rule_suggestions_phase_one_v1(uuid)',
            'finance_refresh_rule_suggestions_legacy_v1()',
        ]) expect(migration).toContain(`drop function public.${signature} restrict;`);
        expect(migration).not.toMatch(/\bcascade\b/i);
    });

    it('keeps replacement function bodies free of removed dependencies', () => {
        const bodies = [...migration.matchAll(/as \$function\$([\s\S]*?)\$function\$/gi)];
        expect(bodies).toHaveLength(4);
        for (const [, body] of bodies) expect(body).not.toMatch(removedNames);
        expect(migration).toContain("'active_reference_rules', 0");
        expect(migration).toContain('Legacy Finance database callers remain');
    });

    it('has no application callers, unused contracts or retired suggestion route', () => {
        const files = ['app', 'lib', 'components', 'services/finance-ocr/src', 'service-worker', 'shared', 'scripts']
            .flatMap((directory) => runtimeFiles(join(root, directory)));
        const callers = files.filter((file) => removedNames.test(readFileSync(file, 'utf8')))
            .map((file) => relative(root, file));
        expect(callers).toEqual([]);
        expect(existsSync(join(root, 'app/api/finance/rule-suggestions/route.ts'))).toBe(false);
    });
});
