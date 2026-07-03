import { describe, expect, it } from 'vitest';
import {
  buildCommandPlan,
  buildReport,
  classifyCommand,
  summarizeText,
} from '@/scripts/qa-runner.mjs';

describe('qa runner command planning', () => {
  it('builds smoke and full command plans in execution order', () => {
    expect(buildCommandPlan('smoke').map((step) => step.category)).toEqual([
      'lint',
      'build',
      'unit',
      'api',
      'db',
      'e2e',
    ]);

    expect(buildCommandPlan('full').at(-1)).toMatchObject({
      category: 'e2e',
      command: 'npx playwright test',
    });
  });

  it('classifies commands by failure category', () => {
    expect(classifyCommand('npm run lint')).toBe('lint');
    expect(classifyCommand('npm run build')).toBe('build');
    expect(classifyCommand('npm run test:api')).toBe('api');
    expect(classifyCommand('npm run test:db')).toBe('db');
    expect(classifyCommand('npx playwright test')).toBe('e2e');
    expect(classifyCommand('node -v')).toBe('environment');
  });
});

describe('qa runner reports', () => {
  it('summarizes long output with the head and tail preserved', () => {
    const text = Array.from({ length: 80 }, (_, index) => `line ${index + 1}`).join('\n');

    const summary = summarizeText(text, 10);

    expect(summary).toContain('line 1');
    expect(summary).toContain('line 80');
    expect(summary).toContain('omitted');
  });

  it('marks the first failed step and links Playwright artifacts', () => {
    const report = buildReport({
      mode: 'smoke',
      startedAt: '2026-07-03T00:00:00.000Z',
      finishedAt: '2026-07-03T00:01:00.000Z',
      branch: 'codex/qa',
      commit: 'abc123',
      steps: [
        {
          name: 'unit tests',
          category: 'unit',
          command: 'npm run test',
          status: 'passed',
          exitCode: 0,
          durationMs: 1000,
          stdout: 'ok',
          stderr: '',
        },
        {
          name: 'Playwright smoke tests',
          category: 'e2e',
          command: 'npx playwright test --project=chromium --grep "@smoke"',
          status: 'failed',
          exitCode: 1,
          durationMs: 2000,
          stdout: 'trace.zip',
          stderr: 'locator failed',
        },
      ],
    });

    expect(report.status).toBe('failed');
    expect(report.failingCommand).toBe('npx playwright test --project=chromium --grep "@smoke"');
    expect(report.suspectedFailureCategory).toBe('e2e');
    expect(report.artifacts).toEqual(
      expect.arrayContaining([
        'qa-report/report.json',
        'qa-report/summary.md',
        'playwright-report/',
        'test-results/',
      ]),
    );
  });

  it('classifies filesystem permission failures as environment failures', () => {
    const report = buildReport({
      mode: 'smoke',
      startedAt: '2026-07-03T00:00:00.000Z',
      finishedAt: '2026-07-03T00:01:00.000Z',
      branch: 'codex/qa',
      commit: 'abc123',
      steps: [
        {
          name: 'Production build',
          category: 'build',
          command: 'npm run build',
          status: 'failed',
          exitCode: 1,
          durationMs: 1000,
          stdout: '',
          stderr: "EPERM: operation not permitted, open '.next/trace'",
        },
      ],
    });

    expect(report.suspectedFailureCategory).toBe('environment');
  });
});
