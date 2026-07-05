import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPORT_DIR = 'qa-report';
const REPORT_JSON = join(REPORT_DIR, 'report.json');
const REPORT_MD = join(REPORT_DIR, 'summary.md');
const REPORT_JSON_ARTIFACT = 'qa-report/report.json';
const REPORT_MD_ARTIFACT = 'qa-report/summary.md';

const COMMANDS = {
  lint: {
    name: 'Lint',
    category: 'lint',
    command: 'npm run lint',
  },
  build: {
    name: 'Production build',
    category: 'build',
    command: 'npm run build',
  },
  unit: {
    name: 'Unit tests',
    category: 'unit',
    command: 'npm run test',
  },
  api: {
    name: 'API route tests',
    category: 'api',
    command: 'npm run test:api',
  },
  db: {
    name: 'DB contract tests',
    category: 'db',
    command: 'npm run test:db',
  },
  e2eSmoke: {
    name: 'Playwright smoke tests',
    category: 'e2e',
    command: 'npx playwright test --project=chromium --grep "@smoke"',
  },
  e2eFull: {
    name: 'Playwright full suite',
    category: 'e2e',
    command: 'npx playwright test',
  },
};

export function buildCommandPlan(mode = 'full') {
  const common = [
    COMMANDS.lint,
    COMMANDS.build,
    COMMANDS.unit,
    COMMANDS.api,
    COMMANDS.db,
  ];

  if (mode === 'smoke') {
    return [...common, COMMANDS.e2eSmoke].map((step) => ({ ...step }));
  }

  if (mode === 'full') {
    return [...common, COMMANDS.e2eFull].map((step) => ({ ...step }));
  }

  if (mode === 'deployed') {
    return [COMMANDS.e2eSmoke].map((step) => ({ ...step }));
  }

  throw new Error(`Unknown QA mode: ${mode}`);
}

export function classifyCommand(command) {
  if (command.includes('lint')) return 'lint';
  if (command.includes('build')) return 'build';
  if (command.includes('test:api')) return 'api';
  if (command.includes('test:db')) return 'db';
  if (command.includes('playwright')) return 'e2e';
  if (command.match(/\btest\b/)) return 'unit';
  return 'environment';
}

function classifyFailure(step) {
  const output = `${step.stderr || ''}\n${step.stdout || ''}`;

  if (/\b(EPERM|EACCES|ENOENT|ENOTCACHED)\b/i.test(output)) {
    return 'environment';
  }

  if (/Executable doesn't exist|Looks like Playwright was just installed/i.test(output)) {
    return 'environment';
  }

  return step.category || classifyCommand(step.command);
}

export function summarizeText(text = '', maxLines = 80) {
  const normalized = String(text).replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';

  const lines = normalized.split('\n');
  if (lines.length <= maxLines) return normalized;

  const headCount = Math.ceil(maxLines / 2);
  const tailCount = Math.floor(maxLines / 2);
  const omitted = lines.length - headCount - tailCount;

  return [
    ...lines.slice(0, headCount),
    `... ${omitted} lines omitted ...`,
    ...lines.slice(-tailCount),
  ].join('\n');
}

export function buildReport({
  mode,
  startedAt,
  finishedAt,
  branch,
  commit,
  steps,
}) {
  const failedStep = steps.find((step) => step.status === 'failed');
  const status = failedStep ? 'failed' : 'passed';
  const suspectedFailureCategory = failedStep
    ? classifyFailure(failedStep)
    : null;

  return {
    schemaVersion: 1,
    mode,
    status,
    startedAt,
    finishedAt,
    durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
    branch,
    commit,
    failingCommand: failedStep?.command ?? null,
    suspectedFailureCategory,
    steps: steps.map((step) => ({
      ...step,
      stdoutSummary: summarizeText(step.stdout),
      stderrSummary: summarizeText(step.stderr),
    })),
    artifacts: [
      REPORT_JSON_ARTIFACT,
      REPORT_MD_ARTIFACT,
      'playwright-report/',
      'test-results/',
    ],
  };
}

export function renderMarkdownSummary(report) {
  const failedStep = report.steps.find((step) => step.status === 'failed');
  const lines = [
    '# QA Report',
    '',
    `- Status: ${report.status}`,
    `- Mode: ${report.mode}`,
    `- Branch: ${report.branch || 'unknown'}`,
    `- Commit: ${report.commit || 'unknown'}`,
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Failing command: ${report.failingCommand || 'none'}`,
    `- Suspected category: ${report.suspectedFailureCategory || 'none'}`,
    '',
    '## Steps',
    '',
  ];

  for (const step of report.steps) {
    lines.push(`### ${step.name}`);
    lines.push('');
    lines.push(`- Status: ${step.status}`);
    lines.push(`- Command: \`${step.command}\``);
    lines.push(`- Exit code: ${step.exitCode}`);
    lines.push(`- Duration: ${step.durationMs}ms`);

    if (step.stdoutSummary) {
      lines.push('');
      lines.push('#### stdout');
      lines.push('');
      lines.push('```text');
      lines.push(step.stdoutSummary);
      lines.push('```');
    }

    if (step.stderrSummary) {
      lines.push('');
      lines.push('#### stderr');
      lines.push('');
      lines.push('```text');
      lines.push(step.stderrSummary);
      lines.push('```');
    }

    lines.push('');
  }

  if (failedStep?.category === 'e2e') {
    lines.push('## Playwright Artifacts');
    lines.push('');
    lines.push('- `playwright-report/`');
    lines.push('- `test-results/`');
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

async function getGitValue(args) {
  const result = await runCommand(`git ${args}`, { stream: false });
  return result.status === 'passed' ? result.stdout.trim() : '';
}

function runCommand(command, { stream = true } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, {
      shell: true,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (stream) process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (stream) process.stderr.write(text);
    });

    child.on('error', (error) => {
      resolve({
        status: 'failed',
        exitCode: 1,
        durationMs: Date.now() - started,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });

    child.on('close', (code) => {
      resolve({
        status: code === 0 ? 'passed' : 'failed',
        exitCode: code ?? 1,
        durationMs: Date.now() - started,
        stdout,
        stderr,
      });
    });
  });
}

function ensureReportDir({ clean = true } = {}) {
  if (clean && existsSync(REPORT_DIR)) {
    rmSync(REPORT_DIR, { recursive: true, force: true });
  }
  mkdirSync(REPORT_DIR, { recursive: true });
}

function writeReport(report) {
  ensureReportDir({ clean: false });
  writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(REPORT_MD, renderMarkdownSummary(report));
}

async function runQa(mode) {
  ensureReportDir();

  const startedAt = new Date().toISOString();
  const branch = process.env.GITHUB_REF_NAME || await getGitValue('branch --show-current');
  const commit = process.env.GITHUB_SHA || await getGitValue('rev-parse HEAD');
  const steps = [];

  for (const planned of buildCommandPlan(mode)) {
    console.log(`\n==> ${planned.name}: ${planned.command}`);
    const result = await runCommand(planned.command);
    steps.push({
      ...planned,
      ...result,
    });

    if (result.status === 'failed') {
      break;
    }
  }

  const finishedAt = new Date().toISOString();
  const report = buildReport({
    mode,
    startedAt,
    finishedAt,
    branch,
    commit,
    steps,
  });

  writeReport(report);

  console.log(`\nQA ${report.status}. Report written to ${REPORT_MD}`);
  return report.status === 'passed' ? 0 : 1;
}

function printFixContext() {
  if (!existsSync(REPORT_JSON)) {
    console.error(`Missing ${REPORT_JSON}. Run npm run qa or npm run qa:smoke first.`);
    return 1;
  }

  const report = JSON.parse(readFileSync(REPORT_JSON, 'utf8'));
  const promptPath = join('scripts', 'qa-agent-prompt.md');
  const prompt = existsSync(promptPath) ? readFileSync(promptPath, 'utf8') : '';

  console.log(prompt.trim());
  console.log('\n---\n');
  console.log(renderMarkdownSummary(report).trim());
  return report.status === 'passed' ? 0 : 1;
}

async function main() {
  const args = process.argv.slice(2);
  const modeIndex = args.indexOf('--mode');
  const mode = modeIndex >= 0 ? args[modeIndex + 1] : 'full';

  if (args.includes('--fix-context')) {
    process.exitCode = printFixContext();
    return;
  }

  try {
    process.exitCode = await runQa(mode);
  } catch (error) {
    ensureReportDir({ clean: false });
    const now = new Date().toISOString();
    const report = buildReport({
      mode,
      startedAt: now,
      finishedAt: now,
      branch: process.env.GITHUB_REF_NAME || '',
      commit: process.env.GITHUB_SHA || '',
      steps: [{
        name: 'QA runner',
        category: 'environment',
        command: 'node scripts/qa-runner.mjs',
        status: 'failed',
        exitCode: 1,
        durationMs: 0,
        stdout: '',
        stderr: error instanceof Error ? error.stack || error.message : String(error),
      }],
    });
    writeReport(report);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
