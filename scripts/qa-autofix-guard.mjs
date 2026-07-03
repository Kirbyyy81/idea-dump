#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function getAutofixDecision({
  branch,
  eventName,
  isForkPullRequest = false,
  agentCommand = '',
}) {
  const normalizedBranch = (branch || '').trim();

  if (!normalizedBranch) {
    return { allowed: false, reason: 'missing branch name' };
  }

  if (normalizedBranch === 'main' || normalizedBranch === 'master') {
    return { allowed: false, reason: 'autofix is disabled on main/master' };
  }

  if (eventName === 'pull_request' && isForkPullRequest) {
    return { allowed: false, reason: 'autofix is disabled for read-only fork pull requests' };
  }

  if (!agentCommand.trim()) {
    return { allowed: false, reason: 'QA_AGENT_COMMAND is not configured' };
  }

  return { allowed: true, reason: 'same-branch autofix is allowed' };
}

function boolFromEnv(value) {
  return value === 'true' || value === '1';
}

function main() {
  const decision = getAutofixDecision({
    branch: process.env.GITHUB_REF_NAME,
    eventName: process.env.GITHUB_EVENT_NAME,
    isForkPullRequest: boolFromEnv(process.env.QA_IS_FORK_PR),
    agentCommand: process.env.QA_AGENT_COMMAND,
  });

  console.log(`allowed=${decision.allowed}`);
  console.log(`reason=${decision.reason}`);

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `allowed=${decision.allowed}\nreason=${decision.reason}\n`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
