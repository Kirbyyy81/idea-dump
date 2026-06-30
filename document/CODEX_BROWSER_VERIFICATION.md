# Codex Browser Verification Handoff

Use this note to reproduce the authenticated sidebar verification on another laptop.

## Current Change Under Test

- File changed: `components/organisms/Sidebar.tsx`
- Purpose: fix sidebar module-tab hover readability.
- Expected behavior: when hovering a module or submodule tab, the background and text color both come from nav design tokens, so text remains readable.
- Lucide icons remain unchanged.

## Codex Test User

- Email: `codex-test@ideadump.local`
- Supabase user id: `c5326811-92a7-4944-a79a-e4a0b724b74d`
- RBAC role: `admin`
- Created for Codex browser verification on 2026-06-30.

Do not commit or store the live password in repo files. If the password is unknown on the second laptop, reset it with the local Supabase service-role credentials.

## Reset Or Re-Provision The Test User

Run this from the repo root on a machine that has `.env.local` with:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Replace `<TEMP_PASSWORD>` before running.

```powershell
@'
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnv(file) {
  const result = {};
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

(async () => {
  const env = loadEnv(path.resolve('.env.local'));
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = 'codex-test@ideadump.local';
  const password = '<TEMP_PASSWORD>';

  let user = null;
  for (let page = 1; page <= 20 && !user; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    user = data.users.find((candidate) => candidate.email === email) || null;
    if ((data.users || []).length < 100) break;
  }

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: 'Codex Test User' },
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { ...(user.user_metadata || {}), name: 'Codex Test User' },
    });
    if (error) throw error;
  }

  const { data: role, error: roleError } = await admin
    .from('DIM_roles')
    .select('id, role')
    .eq('role', 'admin')
    .maybeSingle();
  if (roleError) throw roleError;
  if (!role) throw new Error('Missing admin role');

  const { error: roleUpsertError } = await admin
    .from('BRIDGE_user_roles')
    .upsert({ user_id: user.id, role_id: role.id }, { onConflict: 'user_id' });
  if (roleUpsertError) throw roleUpsertError;

  console.log(JSON.stringify({ email, role: role.role, userId: user.id }));
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
'@ | node -
```

## Local Verification Steps

1. Install dependencies if needed:

   ```powershell
   npm install
   ```

2. Run validation:

   ```powershell
   npm run lint
   npm run build
   ```

3. Start the app on an available port:

   ```powershell
   npm run dev -- -p 3001
   ```

   If `3001` is busy, choose another port.

4. Open `/login`, choose password login, and sign in as `codex-test@ideadump.local`.

5. Navigate to `/dashboard`.

6. Hover each sidebar module tab and expanded project subitem.

7. Confirm:

   - Hovered tab background uses the nav hover token.
   - Hovered tab text remains readable.
   - Active tab text remains readable while hovered.
   - Sidebar font sizing looks consistent across module rows and subitems.

## Current Validation Status

- `npm run lint` passed on 2026-06-30.
- `npm run build` passed on 2026-06-30.
- In-app browser visual verification was not completed on the first laptop because the local server session on alternate port `3001` did not return a stable HTTP response before the run was interrupted.

