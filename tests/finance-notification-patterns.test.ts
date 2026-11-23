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
 it('honors a disabled starter override only for its owner and source', () => {
  const input=sampleNotification('Confirm card payment of RM143.24 to MY SHOPEE MARKETPLACE?');
  input.notification.title='Ryt Bank';
  const starter=notificationPatterns.find(p=>p.format_key==='ryt-card-approval-request')!;
  const disabled={...starter,id:'override',user_id:'owner',source_id:input.source_id,is_active:false};
  expect(parseFinanceNotification(input,[...notificationPatterns,disabled],'owner').status).toBe('review');
  expect(parseFinanceNotification(input,[...notificationPatterns,disabled],'other').status).toBe('ignored');
  expect(parseFinanceNotification({...input,source_id:'different-source'},[...notificationPatterns,disabled],'owner').status).toBe('ignored');
  expect(parseFinanceNotification(input,[...notificationPatterns,{...disabled,is_active:true}],'owner').status).toBe('ignored');
 });
 it('supports editable literal prefixes without substring or regex matching', () => {
  const starter=notificationPatterns.find(p=>p.definition.action==='ignore')!;
  const saved={...starter,id:'custom',user_id:'owner',source_id:'00000000-0000-4000-8000-000000000002',
   definition:{version:1 as const,action:'ignore' as const,parts:['Reminder [card]'],trailing_sentence:true}};
  expect(parseFinanceNotification(sampleNotification('REMINDER [card] payment RM16.00'),[saved],'owner').status).toBe('ignored');
  expect(parseFinanceNotification(sampleNotification('RM16.00 paid at Reminder [card] using your Main Account.'),[...notificationPatterns,saved],'owner').status).toBe('review');
  expect(parseFinanceNotification(sampleNotification('Reminder card payment RM16.00'),[saved],'owner').status).toBe('review');
  expect(parseFinanceNotification({...sampleNotification('Reminder [card] payment RM16.00'),source_package:'my.com.tngdigital.ewallet'},[saved],'owner').status).toBe('review');
  expect(parseFinanceNotification(sampleNotification('Your OTP is 123456 for payment RM16.00'),[{...saved,is_active:false}],'owner').failure_code).toBe('sensitive_notification');
 });
 it('ignores approval requests even when a saved extraction pattern could recognize them', () => {
  const input = sampleNotification('Confirm card payment of RM143.24 to MY SHOPEE MARKETPLACE?');
  input.notification.title = 'Ryt Bank';
  const learned = { ...notificationPatterns.find(p => p.format_key === 'ryt-card-payment')!,
   id:'old-approval-pattern',user_id:'owner',source_id:input.source_id,format_key:'old-approval-request',origin:'learned' as const,
   definition:{version:1 as const,parts:['Confirm card payment of ',{kind:'amount' as const,field:'amount' as const},' to ',
    {kind:'text' as const,field:'merchant' as const},'?'],direction:'expense' as const},
  };
  expect(parseFinanceNotification(input,[...notificationPatterns,learned],'owner')).toMatchObject({status:'ignored',payload:null,failure_code:'not_transaction'});
 });
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
  expect(notificationPatterns.length).toBe(18);
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
 it('keeps overrides isolated from a different package with the same key', () => {
  const seed = notificationPatterns.find(p=>p.format_key==='ryt-card-payment')!;
  const input = sampleNotification('RM16.00 paid at EXAMPLE CAFE using your Main Account.');
  const override = {...seed,id:'override',source_package:'*',user_id:'owner',source_id:input.source_id,is_active:false};
  expect(parseFinanceNotification(input,[seed,override],'owner').payload?.amount).toBe(16);
 });
 it('leaves disagreeing rule values unset', () => {
  const seed = notificationPatterns.find(p=>p.format_key==='ryt-card-payment')!;
  const other = {...seed,id:'other',format_key:'other',definition:{...seed.definition,direction:'income' as const}};
  const result=parseFinanceNotification(sampleNotification('RM16.00 paid at EXAMPLE CAFE using your Main Account.'),[seed,other]);
  expect(result.payload?.direction).toBeNull();
  expect(result.payload?.notification_extraction?.conflicts).toContain('direction');
 });
});
