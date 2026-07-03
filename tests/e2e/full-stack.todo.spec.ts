import { test } from '@playwright/test';

test.describe('seeded authenticated end-to-end flows', () => {
  test.skip('owner creates a project, adds notes, creates tickets, and sees project detail updates', async () => {
    // Requires local Supabase auth seeded from tests/db/seed.sql.
  });

  test.skip('owner creates and exports daily logs', async () => {
    // Requires local Supabase auth seeded from tests/db/seed.sql.
  });

  test.skip('owner creates film camera and roll, then verifies dashboard totals', async () => {
    // Requires local Supabase auth seeded from tests/db/seed.sql and current film schema drift behavior.
  });

  test.skip('restricted member is redirected away from access control', async () => {
    // Requires local Supabase auth seeded from tests/db/seed.sql.
  });
});
