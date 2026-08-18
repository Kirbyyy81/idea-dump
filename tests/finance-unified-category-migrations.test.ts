import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const phaseOneSql = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20260817084716_unify_finance_categories_phase_one.sql'
), 'utf8');
const phaseTwoSql = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20260817085640_remove_finance_category_metadata.sql'
), 'utf8');

describe('unified Finance category migrations', () => {
    it('selects one deterministic category survivor per user and canonical name', () => {
        expect(phaseOneSql).toMatch(
            /partition by category_scores\.user_id, category_scores\.canonical_name/
        );
        expect(phaseOneSql).toMatch(
            /category_scores\.is_archived asc,[\s\S]*category_scores\.reference_count desc,[\s\S]*category_scores\.created_at asc,[\s\S]*category_scores\.id asc/
        );

        for (const reference of [
            'finance_transactions',
            'finance_rules',
            'finance_rule_suggestions',
            'finance_candidate_transactions',
            'finance_corrections',
        ]) {
            expect(phaseOneSql).toContain(`public.${reference}`);
        }
    });

    it('repoints relational and historical JSON category references before deletion', () => {
        expect(phaseOneSql).toContain('set constraints all immediate;');
        expect(phaseOneSql).toMatch(
            /update public\.finance_transactions transactions[\s\S]*set category_id = category_map\.survivor_id/
        );
        expect(phaseOneSql).toMatch(
            /update public\.finance_rules rules[\s\S]*set category_id = category_map\.survivor_id/
        );
        expect(phaseOneSql).toMatch(
            /update public\.finance_rule_suggestions suggestions[\s\S]*set category_id = category_map\.survivor_id/
        );
        expect(phaseOneSql).toMatch(
            /jsonb_set\([\s\S]*'\{category_id\}'[\s\S]*category_map\.survivor_id::text/
        );
        expect(phaseOneSql).toMatch(
            /set previous_value = pg_catalog\.to_jsonb\(category_map\.survivor_id::text\)/
        );
        expect(phaseOneSql).toMatch(
            /set corrected_value = pg_catalog\.to_jsonb\(category_map\.survivor_id::text\)/
        );
        expect(phaseOneSql.indexOf('do $verify_repointed_categories$')).toBeLessThan(
            phaseOneSql.indexOf('delete from public.dim_finance_categories categories')
        );
    });

    it('deduplicates only learned-rule keys that would violate the existing index', () => {
        expect(phaseOneSql).toMatch(/where rules\.auto_created_at is not null/);
        expect(phaseOneSql).toMatch(/and rules\.source_id is not null/);
        expect(phaseOneSql).toMatch(/and rules\.direction is not null/);
        expect(phaseOneSql).toMatch(
            /set matched_rule_id = rule_map\.survivor_rule_id/
        );
        expect(phaseOneSql).toMatch(
            /delete from public\.finance_rules rules[\s\S]*duplicate_rule_id/
        );
    });

    it('removes category-direction enforcement from every database entry point', () => {
        for (const trigger of [
            'finance_transactions_validate_category_direction',
            'finance_rules_validate_category_direction',
            'finance_rule_suggestions_validate_category_direction',
            'finance_categories_guard_type_change',
        ]) {
            expect(phaseOneSql).toContain(`drop trigger if exists ${trigger}`);
        }

        for (const routine of [
            'finance_accept_rule_suggestion',
            'finance_confirm_candidate',
            'finance_refresh_rule_suggestions',
            'finance_update_transaction',
            'finance_validate_active_rule_dimensions',
            'finance_validate_candidate_payload_dimensions',
        ]) {
            expect(phaseOneSql).toContain(`'${routine}'::text`);
        }

        expect(phaseOneSql).toContain("'and[[:space:]]+categories\\.type");
        expect(phaseOneSql).toContain("'and[[:space:]]+type[[:space:]]*=[[:space:]]*p_direction'");
    });

    it('installs shared-name uniqueness while retaining a phase-one default', () => {
        expect(phaseOneSql).toMatch(
            /drop index if exists public\.finance_categories_user_type_name_canonical_idx/
        );
        expect(phaseOneSql).toMatch(
            /drop constraint if exists finance_categories_user_id_type_name_key/
        );
        expect(phaseOneSql).toMatch(
            /create unique index finance_categories_user_name_canonical_idx[\s\S]*user_id, pg_catalog\.lower\(pg_catalog\.btrim\(name\)\)/
        );
        expect(phaseOneSql).toContain("alter column type set default 'expense'");
        expect(phaseOneSql).not.toMatch(/drop column (?:type|color|icon)/);
    });

    it('removes only obsolete category metadata in phase two', () => {
        expect(phaseTwoSql).toMatch(/drop column type/);
        expect(phaseTwoSql).toMatch(/drop column color/);
        expect(phaseTwoSql).toMatch(/drop column icon/);
        expect(phaseTwoSql).toMatch(
            /add constraint finance_categories_text_length_check[\s\S]*char_length\(pg_catalog\.btrim\(name\)\) between 1 and 120/
        );
        expect(phaseTwoSql).toContain(
            'drop function if exists public.finance_validate_category_direction();'
        );
        expect(phaseTwoSql).toContain(
            'drop function if exists public.finance_guard_category_type_change();'
        );
        expect(phaseTwoSql).not.toMatch(/\b(?:grant|revoke)\b/i);
        expect(phaseTwoSql).not.toMatch(/drop (?:constraint|index)[^;]*_fkey/i);
    });
});
