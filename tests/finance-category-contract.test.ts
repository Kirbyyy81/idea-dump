import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    parseFinanceCategoryCreate,
    parseFinanceCategoryUpdate,
} from '@/lib/finance/core/schemas';

const root = path.resolve(import.meta.dirname, '..');
const typesSource = fs.readFileSync(path.join(root, 'lib', 'types.ts'), 'utf8');
const repositorySource = fs.readFileSync(
    path.join(root, 'lib', 'finance', 'core', 'repository.ts'),
    'utf8'
);
const serviceSource = fs.readFileSync(
    path.join(root, 'lib', 'finance', 'core', 'service.ts'),
    'utf8'
);

describe('unified Finance category contract', () => {
    it('creates a category from its name only', () => {
        expect(parseFinanceCategoryCreate({
            name: '  Food  ',
            type: 'expense',
            color: '#fff',
            icon: 'utensils',
        })).toEqual({ data: { name: 'Food' } });
    });

    it('updates only supported category fields', () => {
        expect(parseFinanceCategoryUpdate({
            id: '10000000-0000-4000-8000-000000000001',
            name: '  Salary  ',
            type: 'income',
            color: '#000',
            icon: 'wallet',
        })).toMatchObject({
            data: {
                id: '10000000-0000-4000-8000-000000000001',
                updates: { name: 'Salary' },
                archiveRequested: false,
            },
        });

        expect(parseFinanceCategoryUpdate({
            id: '10000000-0000-4000-8000-000000000001',
            type: 'expense',
        })).toEqual({ error: 'No category changes were provided' });
    });

    it('removes visual metadata and direction coupling from the domain', () => {
        const categoryInterface = typesSource.slice(
            typesSource.indexOf('export interface FinanceCategory'),
            typesSource.indexOf('export interface FinancePayee')
        );

        expect(typesSource).not.toContain('FinanceCategoryType');
        expect(categoryInterface).not.toMatch(/\btype:/);
        expect(categoryInterface).not.toMatch(/\bcolor:/);
        expect(categoryInterface).not.toMatch(/\bicon:/);
        expect(repositorySource).not.toMatch(/\.eq\(['"]type['"]/);
        expect(repositorySource).not.toMatch(/\.order\(['"]type['"]/);
        expect(repositorySource).toMatch(/\.order\(['"]is_archived['"]\)[\s\S]*\.order\(['"]name['"]\)/);
        expect(serviceSource).not.toContain('category.type');
        expect(serviceSource).not.toMatch(/Category (?:type )?must match/);
    });
});
