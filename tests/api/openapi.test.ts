// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/rbac/guards', () => ({
  authorizeSessionModule: vi.fn(),
}));

vi.mock('@/lib/openapi', () => ({
  getOpenApiSpec: () => ({
    openapi: '3.0.0',
    info: { title: 'IdeaDump API', version: 'test' },
  }),
}));

const { authorizeSessionModule } = await import('@/lib/rbac/guards');
const { GET } = await import('@/app/api/openapi/route');

describe('GET /api/openapi', () => {
  it('returns 401 when the user is not authenticated', async () => {
    vi.mocked(authorizeSessionModule).mockResolvedValueOnce({
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns the OpenAPI document when API module access is allowed', async () => {
    vi.mocked(authorizeSessionModule).mockResolvedValueOnce({
      user: { id: 'user-1' },
      access: {
        allowedModules: ['api'],
        canManageAccess: false,
        modules: [],
        overrides: {},
        role: 'member',
        userId: 'user-1',
      },
    } as any);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      openapi: '3.0.0',
      info: { title: 'IdeaDump API' },
    });
  });
});
