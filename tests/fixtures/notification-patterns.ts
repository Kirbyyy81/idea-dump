import type { FinanceNotificationPattern } from '@/lib/types';
// Read the deployment seed so tests cannot silently diverge from stored starter rules.
import { readdirSync, readFileSync } from 'node:fs';
const sql = readdirSync('supabase/migrations')
 .filter(name => /_(finance_notification_patterns|finance_foreign_currency|finance_notification_ignore_rules|finance_notification_notes_editor)\.sql$/.test(name))
 .map(name => readFileSync('supabase/migrations/' + name, 'utf8')).join('\n');
const seededPatterns: FinanceNotificationPattern[] = [...sql.matchAll(/\('([^']+)','([^']+)','([^']+)','([^']+)','((?:''|[^'])+)'::jsonb\)/g)].map(m => ({
 id:m[1],source_package:m[2],format_key:m[3],name:m[4],definition:JSON.parse(m[5].replace(/''/g,"'")),user_id:null,source_id:null,is_active:true,evidence_valid:true,revision:1,
}));

export const notificationPatterns = seededPatterns.filter(pattern => !(pattern.source_package === 'my.com.tngdigital.ewallet'
 && pattern.definition.parts.length === 4 && pattern.definition.parts[1] === ' received from '));
