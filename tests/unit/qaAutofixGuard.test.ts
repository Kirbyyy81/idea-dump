import { describe, expect, it } from 'vitest';
import { getAutofixDecision } from '@/scripts/qa-autofix-guard.mjs';

describe('qa autofix branch guard', () => {
  it('allows same-branch autofix on writable feature branches with an agent command', () => {
    expect(getAutofixDecision({
      branch: 'codex/qa-runner',
      eventName: 'push',
      isForkPullRequest: false,
      agentCommand: 'npm run qa:fix-context',
    })).toEqual({
      allowed: true,
      reason: 'same-branch autofix is allowed',
    });
  });

  it('blocks main, master, fork PRs, and missing agent commands', () => {
    expect(getAutofixDecision({
      branch: 'main',
      eventName: 'push',
      isForkPullRequest: false,
      agentCommand: 'agent',
    })).toMatchObject({ allowed: false });

    expect(getAutofixDecision({
      branch: 'feature',
      eventName: 'pull_request',
      isForkPullRequest: true,
      agentCommand: 'agent',
    })).toMatchObject({ allowed: false });

    expect(getAutofixDecision({
      branch: 'feature',
      eventName: 'push',
      isForkPullRequest: false,
      agentCommand: '',
    })).toMatchObject({
      allowed: false,
      reason: 'QA_AGENT_COMMAND is not configured',
    });
  });
});
