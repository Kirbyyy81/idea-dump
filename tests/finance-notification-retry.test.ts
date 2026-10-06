import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reviewCandidates } from './fixtures/finance-review';
const mocks=vi.hoisted(()=>({find:vi.fn(),retry:vi.fn()}));
vi.mock('@/lib/finance/core/repository',()=>({findFinanceReviewCandidate:mocks.find}));
vi.mock('@/lib/finance/notifications/service',()=>({retryFinanceNotification:mocks.retry,confirmFinanceNotification:vi.fn()}));
import { resolveFinanceReviewCandidateForUser } from '@/lib/finance/core/service';
beforeEach(()=>{
 vi.clearAllMocks();
 mocks.find.mockResolvedValue({data:{id:'candidate-1',status:'pending',intake_item_id:'intake-1',intake:{source:'notification'}}});
});
describe('notification Retry resolution',()=>{
 it('returns success when Retry creates the transaction',async()=>{
  mocks.retry.mockResolvedValue({data:{confirmed:true},error:null});
  expect(await resolveFinanceReviewCandidateForUser('owner','candidate-1','retry',{},'2026-10-02')).toEqual({kind:'success'});
  expect(mocks.retry).toHaveBeenCalledWith('owner','candidate-1','intake-1');
 });
 it('keeps an incomplete notification in review with its text and updated fields',async()=>{
  const candidate=structuredClone(reviewCandidates[0]);
  candidate.payload.duplicate_transaction_id=null;
  candidate.payload.amount=null;
  candidate.intake={...candidate.intake!,source:'notification',notification:{title:'Account activity',body:'Unknown format',subtext:null,source_package:'my.rytbank.app',posted_at:'2026-10-02T00:00:00Z',date_provenance:'posted_at'}};
  mocks.retry.mockResolvedValue({data:{confirmed:false,candidate},error:null});
  expect(await resolveFinanceReviewCandidateForUser('owner','candidate-1','retry',{},'2026-10-02')).toMatchObject({
   kind:'candidate',data:{payload:{amount:null},intake:{source:'notification',notification:{body:'Unknown format'}}},
  });
 });
 it('maps concurrent Retry changes to a recoverable conflict',async()=>{
  mocks.retry.mockResolvedValue({error:{code:'40001'}});
  await expect(resolveFinanceReviewCandidateForUser('owner','candidate-1','retry',{},'2026-10-02')).rejects.toMatchObject({status:409});
 });
});
