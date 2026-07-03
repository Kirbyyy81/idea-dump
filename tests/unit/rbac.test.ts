import { describe, expect, it } from 'vitest';
import { canAccessModule, getFirstAllowedModulePath, normalizeRoleSlug } from '@/lib/rbac/access';
import type { UserAppAccess } from '@/lib/rbac/types';

const access: UserAppAccess = {
  allowedModules: ['dashboard', 'projects', 'settings'],
  canManageAccess: false,
  modules: [
    {
      slug: 'dashboard',
      label: 'Dashboard',
      path: '/dashboard',
      sortOrder: 10,
      enabled: true,
      isManaged: false,
      isAlwaysAllowed: true,
      icon: null,
      description: null,
    },
    {
      slug: 'projects',
      label: 'Projects',
      path: '/projects',
      sortOrder: 20,
      enabled: true,
      isManaged: true,
      isAlwaysAllowed: false,
      icon: null,
      description: null,
    },
  ],
  overrides: {},
  role: 'member',
  userId: 'user-1',
};

describe('RBAC access helpers', () => {
  it('checks allowed modules and falls back to the first allowed path', () => {
    expect(canAccessModule(access, 'projects')).toBe(true);
    expect(canAccessModule(access, 'api')).toBe(false);
    expect(getFirstAllowedModulePath(access)).toBe('/dashboard');
  });

  it('defaults empty role values to member', () => {
    expect(normalizeRoleSlug('')).toBe('member');
    expect(normalizeRoleSlug('custom')).toBe('custom');
  });
});
