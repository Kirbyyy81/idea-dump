import { parseFinanceNotification } from './parser';
import { createHash } from 'node:crypto';
import type { FinanceCandidatePayload, FinanceNotificationEventInput, FinanceNotificationPart, FinanceNotificationPattern, FinanceNotificationPatternDefinition } from '@/lib/types';
import { normalizeFinanceNotificationText as normalize } from './normalization';
import { dateToken, moneyToken, notificationDate, extractNotificationPattern, validNotificationDefinition } from './patterns';
import { normalizeFinancePayeeKey } from '@/lib/finance/ocr/normalizer';

type Reviewed = Pick<FinanceCandidatePayload,'amount'|'direction'|'merchant'|'payee_name'|'transaction_date'|'reference_number'>;
function sameParty(a: string, b: string) { return normalizeFinancePayeeKey(a) === normalizeFinancePayeeKey(b); }
function matchedFields(definition: FinanceNotificationPatternDefinition, text: string, reviewed: Reviewed) {
    const values = extractNotificationPattern(definition,text);
    if (!values) return null;
    const next = structuredClone(definition);
    next.direction = reviewed.direction || undefined;
    for (const part of next.parts) {
        if (typeof part === 'string' || !part.field) continue;
        if (part.kind === 'text') {
            const raw = String(values[part.field] || '');
            part.field = reviewed.merchant && !reviewed.payee_name && sameParty(raw,reviewed.merchant) ? 'merchant'
                : reviewed.payee_name && !reviewed.merchant && sameParty(raw,reviewed.payee_name) ? 'payee_name' : undefined;
        } else if (values[part.field] !== reviewed[part.field]) {
            delete part.field;
        }
    }
    return next;
}
export function learnNotificationPattern(event: FinanceNotificationEventInput, reviewed: Reviewed, patterns: FinanceNotificationPattern[], userId: string) {
    if (!parseFinanceNotification(event).payload) return null;
    const text = normalize(event.notification.text).replace(/[.!?]$/,'');
    const monies = [...text.matchAll(new RegExp(moneyToken,'ig'))];
    if (monies.length !== 1 || !reviewed.direction) return null;
    const known = patterns.filter(p => p.source_package === event.source_package
        && (p.user_id === null || (p.user_id === userId && p.source_id === event.source_id))
        && !p.definition.match && extractNotificationPattern(p.definition,text));
    const owned = known.filter(p=>p.user_id === userId);
    const choices = owned.length ? owned : known;
    if (choices.length === 1) {
        const definition = matchedFields(choices[0].definition,text,reviewed);
        return definition && validNotificationDefinition(definition)
            ? {format_key:choices[0].format_key,name:choices[0].name,definition} : null;
    }
    if (choices.length > 1) return null;
    const spans: { start:number; end:number; part: Exclude<FinanceNotificationPart,string> }[] = [];
    const amount = monies[0];
    spans.push({start:amount.index!,end:amount.index!+amount[0].length,part:{kind:'amount',
        ...(Number(amount[1].replace(/,/g,'')) === reviewed.amount ? {field:'amount' as const} : {})}});
    const party = reviewed.merchant && !reviewed.payee_name ? {value:reviewed.merchant,field:'merchant' as const}
        : reviewed.payee_name && !reviewed.merchant ? {value:reviewed.payee_name,field:'payee_name' as const} : null;
    // Unknown structures need an identified counterparty; do not retain a sample name in an anchor.
    if (!party) return null;
    function locate(value: string) {
        const needle=normalize(value).toLowerCase(), haystack=text.toLowerCase();
        const at=haystack.indexOf(needle);
        return at < 0 || haystack.indexOf(needle,at+1)>=0 ? null : {start:at,end:at+needle.length};
    }
    const partySpan=locate(party.value);
    if (!partySpan) return null;
    spans.push({...partySpan,part:{kind:'text',field:party.field}});
    if (reviewed.reference_number) {
        const at=locate(reviewed.reference_number);
        if (at) spans.push({...at,part:{kind:'reference',field:'reference_number'}});
    }
    const dates=[...text.matchAll(new RegExp('\\b'+dateToken+'\\b','ig'))];
    if (dates.length > 1) return null;
    for (const m of dates) spans.push({start:m.index!,end:m.index!+m[0].length,part:{kind:'date',
        ...(notificationDate(m[0]) === reviewed.transaction_date ? {field:'transaction_date' as const} : {})}});
    const times=[...text.matchAll(/\b\d{1,2}:\d{2}\s*(?:am|pm)\b/ig)];
    if (times.length > 1) return null;
    for (const m of times) spans.push({start:m.index!,end:m.index!+m[0].length,part:{kind:'time'}});
    spans.sort((a,b)=>a.start-b.start);
    const parts: FinanceNotificationPart[]=[];
    let end=0;
    for (const span of spans) {
        if (span.start<end) return null;
        if (span.start>end) parts.push(text.slice(end,span.start));
        parts.push(span.part); end=span.end;
    }
    if (end<text.length) parts.push(text.slice(end));
    // Unknown numbers may be references or account identifiers and must not become retained constants.
    if (parts.some(p=>typeof p==='string' && (/\d/.test(p) || p.length>120))) return null;
    const definition: FinanceNotificationPatternDefinition={version:1,parts,direction:reviewed.direction};
    if (!validNotificationDefinition(definition) || !extractNotificationPattern(definition,text)) return null;
    const shape=parts.map(p=>typeof p==='string'?p.toLowerCase():{kind:p.kind});
    return {format_key:'learned-'+createHash('sha256').update(JSON.stringify(shape)).digest('hex'),
        name:'Reviewed notification format',definition};
}
