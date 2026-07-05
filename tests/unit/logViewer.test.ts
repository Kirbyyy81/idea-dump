import { describe, expect, it } from 'vitest';
import { parseLogText } from '@/lib/logViewer/parse';

describe('log viewer parser', () => {
  it('extracts request metadata and JSON bodies from timestamped lines', () => {
    const events = parseLogText(
      '2026-07-03 10:00:00.000 REQUEST >>>>>> POST >>>>>> URL: https://example.test/api/projects >>>>>> {"title":"QA"}',
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      lineType: 'request',
      method: 'POST',
      url: 'https://example.test/api/projects',
      endpointKey: '/api/projects',
      bodyKind: 'json',
      bodyJson: { title: 'QA' },
    });
  });

  it('groups multiline crash blocks until the next known timestamped event', () => {
    const events = parseLogText([
      '2026-07-03 10:00:00.000 CRASH >>>>>> worker >>>>>> failed',
      'stack line 1',
      'stack line 2',
      '2026-07-03 10:00:01.000 RESPONSE >>>>>> (200) >>>>>> https://example.test/api/projects',
    ].join('\n'));

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      lineType: 'crash',
      endLineNumber: 3,
      endpointKey: 'Crash: worker',
    });
  });
});
