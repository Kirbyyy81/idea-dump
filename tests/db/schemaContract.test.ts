// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const schemaPath = path.join(process.cwd(), 'tests/db/schema.current.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');

const requiredTables: Record<string, string[]> = {
  projects: [
    'id',
    'user_id',
    'title',
    'description',
    'prd_content',
    'github_url',
    'deploy_url',
    'tags',
    'priority',
    'completed',
    'archived',
    'created_at',
    'updated_at',
  ],
  daily_logs: ['id', 'user_id', 'source', 'content', 'effective_date', 'created_at', 'updated_at'],
  api_keys: ['id', 'user_id', 'key_hash', 'name', 'last_used_at', 'created_at'],
  DIM_roles: ['id', 'role', 'name'],
  DIM_modules: [
    'id',
    'modules',
    'name',
    'path',
    'sort_order',
    'is_managed',
    'is_always_allowed',
    'icon',
    'description',
    'enabled',
    'status',
  ],
  BRIDGE_role_modules: ['role_id', 'module_id'],
  BRIDGE_user_roles: ['user_id', 'role_id'],
  app_user_module_overrides: ['id', 'user_id', 'module_id', 'effect'],
  tickets: [
    'id',
    'project_id',
    'user_id',
    'title',
    'description',
    'notes',
    'status',
    'priority',
    'source',
    'tags',
    'created_at',
    'updated_at',
  ],
  film_cameras: ['id', 'user_id', 'name', 'brand', 'model', 'purchase_date', 'notes', 'created_at', 'updated_at'],
  film_rolls: [
    'id',
    'user_id',
    'camera_id',
    'film_name',
    'brand',
    'format',
    'iso',
    'status',
    'purchase_price',
    'frames_taken',
    'successful_photos',
    'location_name',
    'notes',
    'drive_folder_id',
    'cover_photo_id',
    'created_at',
    'updated_at',
  ],
  film_processing_records: [
    'id',
    'user_id',
    'film_roll_id',
    'lab_name',
    'processing_date',
    'processing_cost',
    'scanning_cost',
    'shipping_cost',
    'created_at',
    'updated_at',
  ],
  film_maintenance_records: [
    'id',
    'user_id',
    'camera_id',
    'service_date',
    'service_type',
    'provider_name',
    'maintenance_cost',
    'notes',
    'created_at',
    'updated_at',
  ],
  film_photos: [
    'id',
    'user_id',
    'film_roll_id',
    'drive_file_id',
    'name',
    'mime_type',
    'web_view_link',
    'thumbnail_link',
    'width',
    'height',
    'is_favorite',
    'synced_at',
    'created_at',
    'updated_at',
  ],
  film_drive_connections: [
    'user_id',
    'access_token_encrypted',
    'refresh_token_encrypted',
    'expires_at',
    'scope',
    'token_type',
    'created_at',
    'updated_at',
  ],
};

function getCreateTableBody(tableName: string) {
  const escapedTable = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = schemaSql.match(
    new RegExp(`create table if not exists public\\.${escapedTable}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i'),
  );
  return match?.[1] ?? '';
}

describe('current Supabase schema contract', () => {
  it('uses the current schema snapshot as the test bootstrap source', () => {
    expect(schemaSql).toContain('IdeaDump');
    expect(schemaSql).toContain('Captured: 2026-06-28');
    expect(schemaSql).not.toContain('document/migrations');
  });

  it('contains every current app table and required column', () => {
    for (const [tableName, columns] of Object.entries(requiredTables)) {
      const body = getCreateTableBody(tableName);
      expect(body, `missing create table block for ${tableName}`).not.toBe('');

      for (const column of columns) {
        expect(body, `${tableName}.${column} missing`).toMatch(
          new RegExp(`(^|\\n)\\s*${column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`, 'i'),
        );
      }
    }
  });

  it('documents current film roll drift instead of replaying historical migrations', () => {
    const filmRolls = getCreateTableBody('film_rolls');

    expect(filmRolls).not.toMatch(/lab_name\s+text/i);
    expect(filmRolls).not.toMatch(/processing_cost\s+numeric/i);
    expect(schemaSql).toContain('film_rolls missing 5 columns');
  });

  it('keeps RLS enabled for all current public tables', () => {
    for (const tableName of Object.keys(requiredTables)) {
      expect(schemaSql).toMatch(
        new RegExp(`alter table public\\.${tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} enable row level security;`, 'i'),
      );
    }
  });

  it('includes current policies for user-owned core records', () => {
    expect(schemaSql).toContain('Users can view own projects');
    expect(schemaSql).toContain('Users can insert own logs');
    expect(schemaSql).toContain('Users can update own tickets');
  });
});
