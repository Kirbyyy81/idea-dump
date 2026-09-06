import { createHash } from 'node:crypto';
import type { FinanceParserTemplateField } from '@/lib/types';
import { templateText, templatePayeeKey } from '@/lib/finance/ocr/templateValues';

export function templateValueHash(field: FinanceParserTemplateField, value: string) {
    const canonical = field === 'payee_name' ? templatePayeeKey(value)
        : field === 'merchant' ? templateText(value).toLowerCase() : templateText(value);
    return createHash('sha256').update(canonical).digest('hex');
}
