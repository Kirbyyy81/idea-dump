import type { Project, DailyLogEntry, FilmRoll } from '@/lib/types';

export const projectFixture: Project = {
  id: '10000000-0000-0000-0000-000000000001',
  user_id: '00000000-0000-0000-0000-000000000001',
  title: 'Seed Project',
  description: 'Project used by full-stack tests',
  prd_content: '# Seed Project',
  github_url: null,
  deploy_url: null,
  priority: 'medium',
  completed: false,
  archived: false,
  created_at: '2026-07-03T00:00:00.000Z',
  updated_at: '2026-07-03T00:00:00.000Z',
};

export const dailyLogFixture: DailyLogEntry = {
  id: '20000000-0000-0000-0000-000000000001',
  user_id: '00000000-0000-0000-0000-000000000001',
  source: 'human',
  content: {
    date: '2026-07-03',
    operation_task: 'QA framework setup',
    tools_used: 'Vitest, Playwright, Supabase',
  },
  effective_date: '2026-07-03',
  created_at: '2026-07-03T00:00:00.000Z',
  updated_at: '2026-07-03T00:00:00.000Z',
};

export const filmRollFixture: FilmRoll = {
  id: '30000000-0000-0000-0000-000000000001',
  user_id: '00000000-0000-0000-0000-000000000001',
  camera_id: null,
  film_name: 'Portra 400',
  brand: 'Kodak',
  format: '35mm',
  iso: 400,
  status: 'UNUSED',
  purchase_price: 18,
  lab_name: null,
  processing_cost: 0,
  scanning_cost: 0,
  shipping_cost: 0,
  processing_date: null,
  location_name: null,
  frames_taken: 0,
  successful_photos: 0,
  notes: null,
  drive_folder_id: null,
  cover_photo_id: null,
  created_at: '2026-07-03T00:00:00.000Z',
  updated_at: '2026-07-03T00:00:00.000Z',
};
