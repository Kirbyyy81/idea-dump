import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
export const financeSqlFile = path => readFile(new URL(path, root), 'utf8');

// Real Finance migrations on disposable PostgreSQL. Hosted infrastructure is
// represented only by metadata scaffolding, never external network calls/jobs.
export async function createFinanceTestDatabase(database, { beforeMigration } = {}) {
    const db = database ?? new PGlite();
    await db.exec(`
        do $roles$ declare name text; begin
          foreach name in array array['anon','authenticated','service_role','supabase_admin'] loop
            if not exists(select 1 from pg_roles where rolname=name) then
              execute format('create role %I %s',name,case when name='service_role' then 'bypassrls' else '' end);
            end if;
          end loop;
        end $roles$;
        create schema auth; create table auth.users(id uuid primary key,email text);
        create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
        create schema storage;
        create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
        create schema cron;
        create table cron.job(jobid bigint generated always as identity,jobname text,username text default current_user,schedule text,command text,active boolean default true);
        create function cron.schedule(text,text,text) returns bigint language sql as $$
          insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid $$;
        create function cron.alter_job(job_id bigint,schedule text default null,command text default null,database text default null,username text default null,active boolean default null) returns void language sql as $$ select $$;
        create schema pgmq;
        create table pgmq.q_finance_share_ocr(msg_id bigserial primary key,read_ct int default 0,enqueued_at timestamptz default now(),vt timestamptz default now(),message jsonb);
        create schema vault; create table vault.decrypted_secrets(name text,decrypted_secret text);
        create schema net;
        grant usage on schema public,auth,storage,cron,pgmq,vault,net to service_role;
        grant all on all tables in schema auth,storage,cron,pgmq,vault to service_role;
        grant all on all sequences in schema pgmq to service_role;
    `);
    const baseline = (await financeSqlFile('supabase/schema.sql')).replace(/^\\.*$/gm, '');
    await db.exec(baseline);
    // Historical ledger entries preceded the adopted schema baseline.
    const migrations = (await readdir(new URL('supabase/migrations/', root))).filter(name => name.endsWith('.sql') && name > '20260713021718').sort();
    try {
        for (const name of migrations) {
            await beforeMigration?.(db, name);
            let sql = await financeSqlFile(`supabase/migrations/${name}`);
            sql = sql.replace(/^create extension if not exists (?:pg_cron|pg_net|pgmq)[^;]*;/gim, '');
            await db.exec(sql);
        }
    } catch (error) {
        await db.close();
        throw error;
    }
    await db.exec('set check_function_bodies=on; set row_security=on;');
    return db;
}
