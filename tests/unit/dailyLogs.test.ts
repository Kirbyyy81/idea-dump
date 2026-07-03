import { describe, expect, it } from 'vitest';
import { coerceDailyLogContent, normalizeDailyLogEntry } from '@/lib/dailyLogs';

describe('daily log normalization', () => {
  it('coerces JSON string content while preserving fallback date', () => {
    expect(coerceDailyLogContent('{"operation_task":"Ship tests"}', '2026-07-03')).toEqual({
      date: '2026-07-03',
      day: undefined,
      operation_task: 'Ship tests',
      tools_used: undefined,
      lesson_learned: undefined,
    });
  });

  it('normalizes unknown rows into the app DailyLogEntry contract', () => {
    expect(normalizeDailyLogEntry({
      id: 'log-1',
      user_id: 'user-1',
      source: 'agent',
      content: 'Investigated auth flow',
      effective_date: '2026-07-03',
      created_at: '2026-07-03T08:00:00.000Z',
    })).toMatchObject({
      id: 'log-1',
      user_id: 'user-1',
      source: 'agent',
      content: {
        date: '2026-07-03',
        operation_task: 'Investigated auth flow',
      },
      effective_date: '2026-07-03',
    });
  });
});
