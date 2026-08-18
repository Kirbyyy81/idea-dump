import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const routeSource = read('app', 'api', 'finance', 'reference-data', 'route.ts');
const repositorySource = read('lib', 'finance', 'core', 'repository.ts');
const serviceSource = read('lib', 'finance', 'core', 'service.ts');
const layoutSource = read('app', 'finance', 'layout.tsx');
const settingsPageSource = read('app', 'finance', 'settings', 'page.tsx');
const sourceSettingsSource = read(
    'app', 'finance', 'settings', '_components', 'SourcesSettingsPanel.tsx'
);
const categorySettingsSource = read(
    'app', 'finance', 'settings', '_components', 'CategoriesSettingsPanel.tsx'
);

describe('Finance reference data contract', () => {
    it('protects the endpoint and scopes both minimal queries to active tenant records', () => {
        expect(routeSource).toContain('await authorizeFinance()');
        expect(routeSource).toContain('getFinanceReferenceData(session.user.id)');
        expect(routeSource).toContain("'Cache-Control': 'private, no-store'");

        const categoryQuery = repositorySource.slice(
            repositorySource.indexOf('export async function listActiveFinanceCategoryReferences'),
            repositorySource.indexOf('export async function getOwnedFinanceCategory')
        );
        const sourceQuery = repositorySource.slice(
            repositorySource.indexOf('export async function listActiveFinanceSourceReferences'),
            repositorySource.indexOf('export async function getOwnedFinanceSource')
        );

        for (const query of [categoryQuery, sourceQuery]) {
            expect(query).toContain(".select('id, name')");
            expect(query).toContain(".eq('user_id', userId)");
            expect(query).toContain(".eq('is_archived', false)");
            expect(query).toContain(".order('name')");
        }
        expect(serviceSource).toMatch(/Promise\.all\(\[\s*listActiveFinanceSourceReferences\(userId\),\s*listActiveFinanceCategoryReferences\(userId\)/);
    });

    it('returns explicit browser DTOs without database ownership or timestamp fields', () => {
        const referenceMapper = serviceSource.slice(
            serviceSource.indexOf('function toFinanceReferenceOption'),
            serviceSource.indexOf('function fail')
        );
        const sourceList = repositorySource.slice(
            repositorySource.indexOf('export async function listFinanceSources'),
            repositorySource.indexOf('export async function listActiveFinanceSourceReferences')
        );
        const categoryList = repositorySource.slice(
            repositorySource.indexOf('export async function listFinanceCategories'),
            repositorySource.indexOf('export async function listActiveFinanceCategoryReferences')
        );

        expect(referenceMapper).not.toMatch(/user_id|created_at|updated_at/);
        expect(sourceList).toContain(".select('id, name, filename_aliases, ocr_aliases, is_archived')");
        expect(categoryList).toContain(".select('id, name, is_archived')");
        expect(sourceList).not.toContain(".select('*')");
        expect(categoryList).not.toContain(".select('*')");
    });

    it('mounts once at the Finance boundary and lazily renders only one Settings panel', () => {
        expect(layoutSource).toContain('<FinanceReferenceDataProvider>{children}</FinanceReferenceDataProvider>');
        expect(settingsPageSource).toContain('const ActivePanel = PANELS[section]');
        expect(settingsPageSource).toContain('<ActivePanel />');
    });

    it('synchronizes source and category configuration mutations with active options', () => {
        expect(sourceSettingsSource).toContain('upsertSource(payload.data)');
        expect(sourceSettingsSource).toContain('removeSource(payload.data.id)');
        expect(sourceSettingsSource).toContain('removeSource(deleting.id)');
        expect(categorySettingsSource).toContain('upsertCategory(payload.data)');
        expect(categorySettingsSource).toContain('removeCategory(payload.data.id)');
        expect(categorySettingsSource).toContain('removeCategory(deleting.id)');
    });
});
