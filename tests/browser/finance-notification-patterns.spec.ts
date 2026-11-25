import { expect, test, type Page } from '@playwright/test';
import { reviewCandidates } from '../fixtures/finance-review';
const source='52000000-0000-4000-8000-000000000001';
const pattern={id:'52000000-0000-4000-8000-000000000002',name:'Reviewed card payment',is_active:true,evidence_valid:true,revision:2,
 origin:'learned',source_package:'my.rytbank.app',definition:{version:1,parts:[{kind:'amount',field:'amount'},' paid at ',{kind:'text',field:'merchant'},' using your Main Account'],direction:'expense'}};
test.beforeEach(async({page})=>{
 await page.route('**/api/finance/reference-data',route=>route.fulfill({json:{data:{sources:[{id:source,name:'Ryt'}],categories:[]}}}));
 await page.route('**/api/finance/rules',route=>route.fulfill({json:{data:[],learning:{availability:'never_run'}}}));
 await page.route('**/api/finance/category-memories',route=>route.fulfill({json:{data:[]}}));
});
async function openNotificationPatterns(page: Page) {
 await page.goto('/finance/settings?section=rules');
 await page.getByRole('button',{name:'Notification patterns',exact:true}).click();
}
test('inspects a learned format and disables it with keyboard controls',async({page},info)=>{
 if(info.project.name==='mobile') await page.setViewportSize({width:330,height:800});
 let active=true; let mutation:unknown;
 await page.route('**/api/finance/notification-patterns**',async route=>{
  if(route.request().method()==='PATCH'){mutation=route.request().postDataJSON();active=false;await route.fulfill({json:{success:true}});}
  else await route.fulfill({json:{data:[{...pattern,is_active:active}]}});
 });
 await openNotificationPatterns(page);
 const mobile=info.project.name==='mobile';
 const list=page.getByRole(mobile?'list':'table',{name:'Notification patterns'});
 await expect(list.getByText('Learned from your review',{exact:true})).toBeVisible();
 await expect(page.getByRole(mobile?'table':'list',{name:'Notification patterns'})).toHaveCount(0);
 if(!mobile) await expect(list.getByRole('columnheader')).toHaveText(['Pattern','Matching format and fields','Action','Direction','Status']);
 await expect(list.getByText('[amount] paid at [merchant] using your Main Account',{exact:true})).toBeVisible();
 const toggle=page.getByRole('switch',{name:'Enable Reviewed card payment'});
 if(mobile) await expect(toggle).toHaveText('Enabled');
 else await expect(toggle.getByText('Enabled',{exact:true})).toHaveClass('sr-only');
 const bounds=await toggle.boundingBox();
 expect(bounds?.width).toBeGreaterThanOrEqual(44);
 expect(bounds?.height).toBeGreaterThanOrEqual(44);
 await toggle.focus();await page.keyboard.press('Space');
 await expect(toggle).toHaveAttribute('aria-checked','false');
 if(mobile) await expect(toggle).toHaveText('Disabled');
 else await expect(toggle.getByText('Disabled',{exact:true})).toHaveClass('sr-only');
 expect(mutation).toEqual({id:pattern.id,source_id:source,revision:2,is_active:false});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath('notification-patterns.png'),fullPage:true});
});
test('compares formats, directions and evidence without opening rows',async({page},info)=>{
 const starter={...pattern,id:'starter',name:'Transaction amount',origin:'starter',is_active:false,definition:{version:1,parts:['amount: ',{kind:'amount',field:'amount'}]}};
 const stale={...pattern,id:'stale',name:'Incoming transfer',evidence_valid:false,definition:{...pattern.definition,parts:['Received ',{kind:'amount',field:'amount'},' from ',{kind:'text',field:'payee_name'}],direction:'income'}};
 await page.route('**/api/finance/notification-patterns**',route=>route.fulfill({json:{data:[pattern,starter,stale]}}));
 await openNotificationPatterns(page);
 const mobile=info.project.name==='mobile';
 const list=page.getByRole(mobile?'list':'table',{name:'Notification patterns'});
 const rows=list.getByRole(mobile?'listitem':'row').filter({has:page.getByRole('switch')});
 await expect(rows).toHaveCount(3);
 const starterRow=rows.filter({has:page.getByRole('button',{name:'Edit Transaction amount',exact:true})});
 await expect(starterRow.getByText('amount: [amount]',{exact:true})).toBeVisible();
 await expect(starterRow.getByText('Not specified',{exact:true})).toBeVisible();
 await expect(starterRow.getByRole('switch')).toHaveAttribute('aria-checked','false');
 const incomeRow=rows.filter({has:page.getByRole('button',{name:'Edit Incoming transfer',exact:true})});
 await expect(incomeRow.getByText('Received [amount] from [payee name]',{exact:true})).toBeVisible();
 await expect(incomeRow.getByText('income',{exact:true})).toBeVisible();
 await expect(incomeRow.getByText('Supporting transaction changed. Confirm a new example to relearn.',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath('notification-patterns.png'),fullPage:true});
});
test('failed status changes preserve the displayed state and show recovery',async({page})=>{
 await page.route('**/api/finance/notification-patterns**',async route=>{
  await route.fulfill(route.request().method()==='PATCH'?{status:409,json:{error:'Pattern changed. Refresh and try again.'}}:{json:{data:[pattern]}});
 });
 await openNotificationPatterns(page);
 const toggle=page.getByRole('switch',{name:'Enable Reviewed card payment'});
 await toggle.click();
 await expect(page.getByRole('alert')).toHaveText('Pattern changed. Refresh and try again.');
 await expect(toggle).toHaveAttribute('aria-checked','true');
});
test('shows learned field provenance and unresolved conflicts in review',async({page})=>{
 const candidate=structuredClone(reviewCandidates[0]);
 candidate.intake={...candidate.intake!,source:'notification'};
 candidate.payload.notification_extraction={version:1,fields:{amount:{pattern_id:pattern.id,revision:2,learned:true}},conflicts:['direction']};
 await page.addInitScript(candidate=>{(window as unknown as {reviewInitial:unknown}).reviewInitial=[candidate];},candidate);
 await page.goto('/finance/review');
 await expect(page.getByText('Learned from your reviews: amount.',{exact:true})).toBeVisible();
 await expect(page.getByText('Conflicting notification patterns. Review direction.',{exact:true})).toBeVisible();
});

for (const completed of [true,false]) {
 test(completed ? 'Retry adds a complete notification and removes it from review' : 'Retry keeps an incomplete notification available for review',async({page})=>{
  const candidate=structuredClone(reviewCandidates[0]);
  candidate.intake={...candidate.intake!,source:'notification'};
  candidate.payload.duplicate_transaction_id=null;candidate.duplicate_transaction=null;candidate.duplicate_outcome='none';
  await page.addInitScript(candidate=>{(window as unknown as {reviewInitial:unknown}).reviewInitial=[candidate];},candidate);
  await page.route('**/api/finance/review',async route=>{
   expect(route.request().postDataJSON()).toMatchObject({action:'retry',candidate_id:candidate.id});
   await route.fulfill({json:completed?{success:true}:{data:{...candidate,payload:{...candidate.payload,amount:null}}}});
  });
  await page.goto('/finance/review');
  if (!completed) await page.getByLabel('Notes', { exact: true }).fill('Keep this draft');
  await page.getByRole('button',{name:'Retry and add if complete',exact:true}).click();
  if(completed) {
   await expect(page.getByRole('status')).toHaveText('1 added. 0 still need review.');
   await expect(page.getByRole('button',{name:'Retry and add if complete',exact:true})).toHaveCount(0);
  } else {
   await expect(page.getByRole('status')).toHaveText('0 added. 1 still need review.');
   await expect(page.getByRole('button',{name:'Retry and add if complete',exact:true})).toBeVisible();
   await expect(page.getByLabel('Notes', { exact: true })).toHaveValue('Keep this draft');
   await expect(page.getByRole('spinbutton', { name: 'Amount' })).toHaveValue('');
  }
 });
}

test('queue retry checks all items in order, including screenshots, and keeps failures and duplicates visible', async ({ page }) => {
 const makeCandidate = (id: string, merchant: string, intakeSource: 'notification' | 'screenshot') => ({
  ...reviewCandidates[0], id, intake: { source: intakeSource },
  payload: { ...reviewCandidates[0].payload, merchant, payee_name: null },
 });
 const added = makeCandidate('candidate-1', 'Trip shop', 'notification');
 const failed = makeCandidate('candidate-2', 'Offline shop', 'notification');
 const duplicate = makeCandidate('candidate-3', 'Receipt shop', 'screenshot');
 await page.addInitScript(rows => { Object.assign(window, { reviewInitial: rows }); }, [added, failed, duplicate]);
 const attempts: string[] = [];
 let releaseFirst!: () => void;
 const firstResponse = new Promise<void>(resolve => { releaseFirst = resolve; });
 await page.route('**/api/finance/review', async route => {
  const { candidate_id, action } = route.request().postDataJSON();
  expect(action).toBe('retry');
  attempts.push(candidate_id);
  if (candidate_id === added.id) {
   await firstResponse;
   await route.fulfill({ json: { success: true } });
  } else if (candidate_id === failed.id) {
   await route.fulfill({ status: 503, json: { error: 'Temporarily unavailable' } });
  } else {
   await route.fulfill({ json: { data: { ...duplicate, payload: { ...duplicate.payload, amount: 22 },
    duplicate_outcome: 'strong' } } });
  }
 });
 await page.goto('/finance/review');
 const retry = page.locator('header').filter({ has: page.getByRole('heading', { name: 'Review queue', exact: true }) })
  .getByRole('button', { name: 'Retry and add if complete', exact: true });
 await expect(retry).toBeVisible();
 await expect(page.getByRole('button', { name: 'Retry rules', exact: true })).toHaveCount(0);
 await retry.click();
 await expect(retry).toBeDisabled();
 await expect(page.getByText('Retrying review queue: 0 of 3 checked.')).toBeVisible();
 await expect.poll(() => attempts).toEqual([added.id]);
 releaseFirst();
 await expect(page.getByRole('status')).toHaveText('1 added. 1 still need review. 1 could not be retried.');
 expect(attempts).toEqual([added.id, failed.id, duplicate.id]);
 await expect(page.getByRole('button', { name: /Trip shop/ })).toHaveCount(0);
 await expect(page.getByRole('button', { name: /Offline shop/ })).toHaveAttribute('aria-pressed', 'true');
 await expect(page.getByRole('button', { name: /Receipt shop/ })).toContainText('Strong duplicate match');
 await expect(retry).toBeEnabled();
});

test('edits, disables, restores and creates saved ignore rules',async({page},info)=>{
 if(info.project.name==='mobile') await page.setViewportSize({width:330,height:800});
 const ignore={...pattern,id:'52000000-0000-4000-8000-000000000018',name:'Card payment approval prompt',origin:'starter',revision:1,
  definition:{version:1,action:'ignore',parts:['Tap to confirm card payment'],trailing_sentence:true}};
 let rows=[ignore]; const writes:Record<string,unknown>[]=[];
 await page.route('**/api/finance/notification-patterns**',async route=>{
  const method=route.request().method();
  if(method==='GET') return route.fulfill({json:{data:rows}});
  const body=route.request().postDataJSON();writes.push(body);
  if(method==='PATCH') rows=rows.map(row=>({...row,is_active:body.is_active,revision:row.revision+1}));
  else if(body.id) rows=rows.map(row=>({...row,name:body.name,is_active:body.is_active,origin:'override',revision:row.revision+1,definition:{...row.definition,parts:[body.prefix]}}));
  else rows.push({...ignore,id:'custom-ignore',name:body.name,source_package:body.source_package,is_active:body.is_active,origin:'override',definition:{...ignore.definition,parts:[body.prefix]}});
  await route.fulfill({json:{success:true}});
 });
 await openNotificationPatterns(page);
 const row=page.getByRole(info.project.name==='mobile'?'listitem':'row').filter({hasText:'Card payment approval prompt'});
 await expect(row.getByText('Ignore notification',{exact:true})).toBeVisible();
 const edit=row.getByRole('button',{name:'Edit Card payment approval prompt'});
 await edit.focus();await page.keyboard.press('Enter');
 const dialog=page.getByRole('dialog',{name:'Edit ignore rule'});
 await expect(dialog.getByLabel('Application')).toBeDisabled();
 await dialog.getByLabel('Rule name').fill('Approval requests');
 await dialog.getByLabel('Starts with').fill('Confirm card payment of');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath('ignore-rule-editor.png'),fullPage:true});
 await dialog.getByRole('button',{name:'Save rule',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Edit Approval requests',exact:true})).toBeFocused();
 expect(writes[0]).toMatchObject({id:ignore.id,revision:1,source_id:source,name:'Approval requests',prefix:'Confirm card payment of'});
 const toggle=page.getByRole('switch',{name:'Enable Approval requests'});
 await toggle.click();await expect(toggle).toHaveAttribute('aria-checked','false');
 await toggle.focus();await page.keyboard.press('Space');await expect(toggle).toHaveAttribute('aria-checked','true');
 await page.getByRole('button',{name:'Add ignore rule',exact:true}).click();
 const create=page.getByRole('dialog',{name:'Add ignore rule'});
 await create.getByLabel('Rule name').fill('Payment reminders');
 await create.getByLabel('Starts with').fill('Please complete your payment');
 await create.getByRole('button',{name:'Save rule',exact:true}).click();
 await expect(page.getByRole('button',{name:'Edit Payment reminders',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Add ignore rule',exact:true})).toBeFocused();
 expect(writes.at(-1)).toMatchObject({id:null,revision:null,source_id:source,prefix:'Please complete your payment'});
});

test('edits extraction formats with a terminal notes field',async({page})=>{
 let saved:Record<string,unknown>|undefined;
 const notes={...pattern,id:'52000000-0000-4000-8000-000000000020',name:'TNG incoming transfer with notes',source_package:'my.com.tngdigital.ewallet',origin:'starter',
  definition:{version:1,parts:[{kind:'amount',field:'amount'},' received from ',{kind:'text',field:'payee_name'},' for ',{kind:'notes',field:'notes'}],direction:'income'}};
 await page.route('**/api/finance/notification-patterns**',async route=>{
  if(route.request().method()==='PUT'){saved=route.request().postDataJSON();return route.fulfill({json:{success:true}});}
  await route.fulfill({json:{data:[notes]}});
 });
 await openNotificationPatterns(page);
 await page.getByRole('button',{name:'Edit TNG incoming transfer with notes',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Edit notification pattern'});
 await expect(dialog.getByLabel('Matching format')).toHaveValue('[amount] received from [payee name] for [notes]');
 await dialog.getByLabel('Matching format').fill('[amount][payee name]');
 await dialog.getByRole('button',{name:'Save pattern',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('Separate fields');expect(saved).toBeUndefined();
 await dialog.getByLabel('Matching format').fill('[amount] received from [payee name] for ');
 await dialog.getByRole('combobox',{name:'Insert field',exact:true}).click();
 await page.getByRole('option',{name:'notes',exact:true}).click();
 await expect(dialog.getByLabel('Matching format')).toHaveValue('[amount] received from [payee name] for [notes]');
 await dialog.getByRole('button',{name:'Save pattern',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 expect(saved).toMatchObject({kind:'extract',id:notes.id,revision:2,source_id:source,definition:notes.definition});
});
