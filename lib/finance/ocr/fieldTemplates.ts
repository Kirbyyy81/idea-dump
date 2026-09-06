import { hasReceiptToday, screenshotFilenameDate, receiptReferenceValue } from '@/lib/finance/ocr/receiptPatterns';
import { templateValueHash } from '@/lib/finance/ocr/templateHash';
import type {
    FinanceCandidatePayload, FinanceOcrFieldTemplate, FinanceOcrPayee,
    FinanceParserTemplateEvaluation, FinanceParserTemplateField,
} from '@/lib/types';
import { isFinanceParserTemplateContract, orderFinanceParserTemplates, selectFinanceParserTemplateProposal } from '@/lib/finance/ocr/templateContract';
import { FINANCE_TEMPLATE_FIELDS, templateLines, templatePayee, templateSourcePhrase, templateText, templateValue } from '@/lib/finance/ocr/templateValues';
import { extractFinanceRecipientReference, mergeFinanceRecipientReferenceIntoNotes } from '@/lib/finance/ocr/recipientReference';

function remainder(line: string, label: string) {
    const text = templateText(line);
    const anchor = templateText(label);
    if (!text.toLowerCase().startsWith(anchor.toLowerCase())) return undefined;
    const tail = text.slice(anchor.length);
    if (tail && !/^(?:\s*[:-]\s*|\s+)/.test(tail)) return undefined;
    return tail.replace(/^\s*[:-]?\s*/, '');
}

export function extractFinanceTemplateValue(
    template: FinanceOcrFieldTemplate, text: string, payees: FinanceOcrPayee[] = [], filename: string | null = null,
): string | null | undefined {
    const lines = templateLines(text);
    const config = template.configuration;
    if (config.type === 'filename_date') return hasReceiptToday(text) ? screenshotFilenameDate(filename) : undefined;
    if (config.type === 'reference_label') return receiptReferenceValue(text, config);
    const validate = (raw: string) => {
        const value = templateValue(template.field_name, raw);
        if (!value || template.field_name !== 'payee_name') return value;
        return templatePayee(value, payees)?.name ?? null;
    };
    if (config.type === 'direction_phrase') {
        return config.phrases.some((phrase) => lines.some((line) => (
            (' ' + templateSourcePhrase(line) + ' ').includes(' ' + templateSourcePhrase(phrase) + ' ')
        ))) ? config.direction : undefined;
    }
    if (config.type === 'saved_payee_match') {
        const matches = new Map(lines.map((line) => templatePayee(line, payees))
            .filter((payee): payee is FinanceOcrPayee => Boolean(payee)).map((payee) => [payee.id, payee]));
        return matches.size === 1 ? [...matches.values()][0].name : matches.size > 1 ? null : undefined;
    }
    if (config.type !== 'same_line_label' && config.type !== 'next_non_empty_line') return undefined;
    let matched = false;
    for (let index = 0; index < lines.length; index += 1) {
        const tail = remainder(lines[index], config.label);
        if (tail === undefined) continue;
        if (config.type === 'same_line_label') {
            if (!tail) continue;
            return validate(tail);
        }
        if (tail !== '') continue;
        matched = true;
        let count = 0;
        for (let next = index + 1; next < Math.min(lines.length, index + 7); next += 1) {
            if (!lines[next]) continue;
            count += 1;
            const value = validate(lines[next]);
            if (value) return value;
            if (count >= config.max_lines) break;
        }
    }
    return matched ? null : undefined;
}

export function applyFinanceFieldTemplates(
    text: string, payload: FinanceCandidatePayload, sourceId: string | null,
    templates: FinanceOcrFieldTemplate[], payees: FinanceOcrPayee[] = [], filename: string | null = null,
) {
    if (!sourceId || !templates.length) return { payload, evaluations: [] as FinanceParserTemplateEvaluation[] };
    const eligible = orderFinanceParserTemplates(templates.filter((template) => (
        isFinanceParserTemplateContract(template) && template.scope_source_id === sourceId
        && (template.status === 'active' || template.status === 'shadow')
    )), sourceId);
    const nextPayload = { ...payload };
    const evaluations: FinanceParserTemplateEvaluation[] = [];
    const selected = new Map<FinanceParserTemplateField, { template: FinanceOcrFieldTemplate; value: string }>();
    for (const field of FINANCE_TEMPLATE_FIELDS) {
        const proposals: Array<{ template: FinanceOcrFieldTemplate; value: string }> = [];
        for (const template of eligible.filter((item) => item.field_name === field).slice(0, 20)) {
            const value = extractFinanceTemplateValue(template, text, payees, filename);
            const evaluation: FinanceParserTemplateEvaluation = {
                template_id: template.id, field_name: field,
                status: template.status as 'active' | 'shadow',
                outcome: value === undefined ? 'not_applicable' : value === null ? 'invalid_output' : 'shadow',
                ...(template.algorithm_version === 2 ? {
                    algorithm_version: 2, template_version: template.template_version,
                    ...(value ? { value_hash: templateValueHash(field, value) } : {}),
                } : {}),
            };
            // Retain every bounded observation, including losing proposals and misses.
            if (value && template.status === 'active') {
                proposals.push({ template, value });
                evaluation.outcome = 'not_applicable';
            }
            evaluations.push(evaluation);
        }
        const decision = selectFinanceParserTemplateProposal(proposals, sourceId);
        if (decision.status === 'selected') selected.set(field, {
            template: decision.proposal.template, value: String(decision.proposal.value),
        });
        if (decision.status === 'conflict') {
            for (const evaluation of evaluations) {
                if (decision.templateIds.includes(evaluation.template_id)) evaluation.outcome = 'conflict';
            }
        }
    }
    if (selected.has('merchant') && (selected.has('payee_name') || payload.payee_id || payload.payee_name)) {
        for (const field of ['merchant', 'payee_name'] as const) {
            const proposal = selected.get(field);
            if (proposal) {
                const evaluation = evaluations.find((item) => item.template_id === proposal.template.id);
                if (evaluation) evaluation.outcome = 'conflict';
                selected.delete(field);
            }
        }
    }
    for (const [field, proposal] of selected) {
        const evaluation = evaluations.find((item) => item.template_id === proposal.template.id);
        if (field === 'recipient_reference') continue;
        if (field === 'payee_name') {
            const payee = templatePayee(proposal.value, payees);
            if (!payee) continue;
            nextPayload.payee_id = payee.id;
            nextPayload.payee_name = payee.name;
            nextPayload.merchant = null;
        } else if (field === 'direction') {
            nextPayload.direction = proposal.value as 'expense' | 'income';
        } else if (field === 'reference_number' || field === 'merchant' || field === 'transaction_date' || field === 'notes') {
            nextPayload[field] = proposal.value;
        }
        if (evaluation) evaluation.outcome = 'applied';
    }
    const recipient = selected.get('recipient_reference');
    const genericRecipient = extractFinanceRecipientReference(text);
    // Replace the generic reference line when a learned reference corrects it.
    const existingNotes = recipient && !selected.has('notes') && genericRecipient
        ? nextPayload.notes?.split(/\r?\n/).filter((line) => line !== genericRecipient).join('\n')
        : nextPayload.notes;
    const notes = mergeFinanceRecipientReferenceIntoNotes(
        recipient?.value ?? genericRecipient, existingNotes,
    );
    if ((recipient || selected.has('notes')) && (notes?.length ?? 0) <= 2500) {
        nextPayload.notes = notes;
        const evaluation = evaluations.find((item) => item.template_id === recipient?.template.id);
        if (evaluation) evaluation.outcome = 'applied';
    } else if (recipient || selected.has('notes')) {
        nextPayload.notes = payload.notes;
        for (const item of evaluations) {
            if (item.field_name === 'notes' || item.field_name === 'recipient_reference') item.outcome = 'invalid_output';
        }
    }
    return { payload: nextPayload, evaluations };
}

// Keep the Phase 3 pure API compatible with existing callers.
export const applyFinanceCriticalFieldTemplates = applyFinanceFieldTemplates;
