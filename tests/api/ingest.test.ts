// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/ingest/route';

describe('POST /api/ingest', () => {
  it('rejects requests without an API key before touching the database', async () => {
    const request = new NextRequest('http://localhost/api/ingest', {
      method: 'POST',
      body: JSON.stringify({ title: 'No Key' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'API key required. Include x-api-key header.',
    });
  });
});
