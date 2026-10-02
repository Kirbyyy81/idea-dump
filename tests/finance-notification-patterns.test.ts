import { describe, expect, it } from 'vitest';
import { notificationPatterns } from './fixtures/notification-patterns';
import { parseFinanceNotification } from '@/lib/finance/notifications/parser';
import { validNotificationDefinition } from '@/lib/finance/notifications/patterns';
import type { FinanceNotificationEventInput } from '@/lib/types';

export const sampleNotification = (text: string): FinanceNotificationEventInput => ({
 client_event_id:'00000000-0000-4000-8000-000000000001',source_id:'00000000-0000-4000-8000-000000000002',
 source_package:'my.rytbank.app',captured_at:'2026-10-02T07:45:58Z',notification_key_hash:'a'.repeat(64),
 notification:{title:'Card payment completed',text,subtext:null,posted_at:'2026-10-02T07:45:54Z'},
});
describe('stored notification patterns', () => {
 it('extracts the new card format using only stored starter data', () => {
  const event = sampleNotification('RM16.00 paid at SYNTHETIC CAFE - PJ using your Main Account.');
  expect(parseFinanceNotification(event,notificationPatterns).payload).toMatchObject({
   amount:16,direction:'expense',merchant:'SYNTHETIC CAFE - PJ',payee_name:null,transaction_date:'2026-10-02',
  });
  expect(parseFinanceNotification(event,[]).payload).toMatchObject({amount:null,direction:null,merchant:null});
 });
 it('keeps unknown money-bearing formats reviewable without requiring a transaction keyword', () => {
  expect(parseFinanceNotification(sampleNotification('RM19.00 settled at EXAMPLE SHOP.')).status).toBe('review');
 });
 it('validates every migration seed and rejects executable or unbounded rules', () => {
  expect(notificationPatterns.length).toBe(15);
  for (const p of notificationPatterns) expect(validNotificationDefinition(p.definition),p.name).toBe(true);
  expect(validNotificationDefinition({version:1,regex:'.*',parts:['paid ',{kind:'amount',field:'amount'}]})).toBe(false);
  expect(validNotificationDefinition({version:1,parts:[{kind:'text'},' and ',{kind:'text'}]})).toBe(false);
 });
 it('honors disabled and invalidated overrides without changing other owners', () => {
  const seed = notificationPatterns.find(p=>p.format_key==='ryt-card-payment')!;
  const input = sampleNotification('RM16.00 paid at EXAMPLE CAFE using your Main Account.');
  const override = {...seed,id:'override',user_id:'owner',source_id:input.source_id,is_active:false};
  expect(parseFinanceNotification(input,[seed,override],'owner').payload?.amount).toBeNull();
  expect(parseFinanceNotification(input,[seed,override],'other').payload?.amount).toBe(16);
  expect(parseFinanceNotification(input,[seed,{...override,is_active:true,evidence_valid:false}],'owner').payload?.direction).toBeNull();
 });
 it('leaves disagreeing rule values unset', () => {
  const seed = notificationPatterns.find(p=>p.format_key==='ryt-card-payment')!;
  const other = {...seed,id:'other',format_key:'other',definition:{...seed.definition,direction:'income' as const}};
  const result=parseFinanceNotification(sampleNotification('RM16.00 paid at EXAMPLE CAFE using your Main Account.'),[seed,other]);
  expect(result.payload?.direction).toBeNull();
  expect(result.payload?.notification_extraction?.conflicts).toContain('direction');
 });
});
