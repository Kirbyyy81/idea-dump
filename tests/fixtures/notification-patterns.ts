import type { FinanceNotificationPattern } from '@/lib/types';
// Read the deployment seed so tests cannot silently diverge from stored starter rules.
import { readdirSync, readFileSync } from 'node:fs';
const sql = readdirSync('supabase/migrations')
 .filter(name => /_(finance_notification_patterns|finance_foreign_currency)\.sql$/.test(name))
 .map(name => readFileSync('supabase/migrations/' + name, 'utf8')).join('\n');
export const notificationPatterns: FinanceNotificationPattern[] = [...sql.matchAll(/\('([^']+)','([^']+)','([^']+)','([^']+)','((?:''|[^'])+)'::jsonb\)/g)].map(m => ({
 id:m[1],source_package:m[2],format_key:m[3],name:m[4],definition:JSON.parse(m[5].replace(/''/g,"'")),user_id:null,source_id:null,is_active:true,evidence_valid:true,revision:1,
}));
