#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function env(name, defaultValue = '') {
  return (process.env[name] || defaultValue).trim();
}

function splitCsv(value) {
  return value
    .replace(/;/g, ',')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function shellSplit(value) {
  const matches = value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  return matches.map((item) => item.replace(/^['"]|['"]$/g, ''));
}

function runGit(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function tryRunGit(args) {
  try {
    return runGit(args);
  } catch (error) {
    return null;
  }
}

function detectDiff() {
  const inlineDiff = env('AI_REVIEW_DIFF');
  if (inlineDiff) return inlineDiff;

  const diffFile = env('AI_REVIEW_DIFF_FILE');
  if (diffFile) return fs.readFileSync(diffFile, 'utf8');

  const explicitRange = env('AI_REVIEW_DIFF_RANGE');
  if (explicitRange) {
    return runGit(['diff', '--no-ext-diff', ...shellSplit(explicitRange)]);
  }

  const eventName = env('GITHUB_EVENT_NAME');
  const eventPath = env('GITHUB_EVENT_PATH');
  if (eventName === 'pull_request' && eventPath && fs.existsSync(eventPath)) {
    const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    const baseSha = event.pull_request && event.pull_request.base && event.pull_request.base.sha;
    const headSha = event.pull_request && event.pull_request.head && event.pull_request.head.sha;
    if (baseSha && headSha) {
      const diff = tryRunGit(['diff', '--no-ext-diff', `${baseSha}...${headSha}`]);
      if (diff !== null) return diff;
    }
  }

  const baseRef = env('GITHUB_BASE_REF');
  const sha = env('GITHUB_SHA', 'HEAD');
  const candidates = [];
  if (baseRef) {
    tryRunGit(['fetch', 'origin', baseRef, '--depth=100']);
    candidates.push(['diff', '--no-ext-diff', `origin/${baseRef}...${sha}`]);
  }
  candidates.push(['diff', '--no-ext-diff', 'HEAD~1', 'HEAD']);
  candidates.push(['diff', '--no-ext-diff', '--cached']);
  candidates.push(['diff', '--no-ext-diff']);

  for (const candidate of candidates) {
    const diff = tryRunGit(candidate);
    if (diff !== null) return diff;
  }
  throw new Error('Unable to create git diff.');
}

function truncateDiff(diffText) {
  const maxBytes = Number(env('AI_REVIEW_MAX_DIFF_BYTES', '200000'));
  const buffer = Buffer.from(diffText, 'utf8');
  if (buffer.length <= maxBytes) {
    return { diffText, wasTruncated: false };
  }
  return { diffText: buffer.subarray(0, maxBytes).toString('utf8'), wasTruncated: true };
}

function walkMarkdownFiles(dir) {
  const result = [];
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      result.push(fullPath);
    }
  }
  return result.sort();
}

function rulesetDirs(root) {
  return [
    ...splitCsv(env('AI_REVIEW_PROJECT_TYPES', '')),
    ...splitCsv(env('AI_REVIEW_EXTRA_RULESETS', '')),
  ].map((item) => path.join(root, item));
}

function readRules(root) {
  const sections = [];
  const missing = [];
  for (const rulesDir of rulesetDirs(root)) {
    if (!fs.existsSync(rulesDir)) {
      missing.push(rulesDir);
      continue;
    }
    for (const filePath of walkMarkdownFiles(rulesDir)) {
      const content = fs.readFileSync(filePath, 'utf8').trim();
      if (content) {
        sections.push(`## ${path.relative(root, filePath)}\n\n${content}`);
      }
    }
  }
  if (missing.length > 0 && env('AI_REVIEW_STRICT_RULESETS', 'false').toLowerCase() === 'true') {
    throw new Error(`Missing rulesets: ${missing.join(', ')}`);
  }
  return { rules: sections.join('\n\n'), missing };
}

function buildMessages(rules, diffText, wasTruncated) {
  const language = env('AI_REVIEW_LANGUAGE', 'zh-CN');
  const truncationNote = wasTruncated
    ? 'Diff was truncated because it exceeded AI_REVIEW_MAX_DIFF_BYTES.'
    : 'Diff is complete.';
  const system = `You are a senior code reviewer. Review only the supplied git diff.\nRespond in ${language}. Prioritize correctness, security, maintainability, performance, and project-specific rules.\nDo not invent files or issues not supported by the diff.\nFor each finding include severity, file/path if visible, reason, and suggested fix.\nIf no substantive issue exists, say so clearly.`;
  const user = `# Review Rules\n\n${rules || 'No custom rules were provided.'}\n\n# Diff Context\n\n${truncationNote}\n\n\`\`\`diff\n${diffText}\n\`\`\``;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

async function callModel(messages) {
  const apiKey = env('AI_REVIEW_API_KEY');
  if (!apiKey) throw new Error('AI_REVIEW_API_KEY is required');

  const baseUrl = env('AI_REVIEW_BASE_URL', 'https://api.openai.com/v1').replace(/\/$/, '');
  const endpoint = env('AI_REVIEW_ENDPOINT', `${baseUrl}/chat/completions`);
  const payload = {
    model: env('AI_REVIEW_MODEL', 'gpt-4.1-mini'),
    messages,
    temperature: Number(env('AI_REVIEW_TEMPERATURE', '0.1')),
  };
  const maxTokens = env('AI_REVIEW_MAX_TOKENS');
  if (maxTokens) payload.max_tokens = Number(maxTokens);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(env('AI_REVIEW_TIMEOUT_SECONDS', '120')) * 1000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Model request failed: HTTP ${response.status}: ${text}`);
    }
    const data = JSON.parse(text);
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) {
      throw new Error(`Unexpected model response: ${text.slice(0, 1000)}`);
    }
    return content.trim();
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const root = env('AI_REVIEW_RULESETS_DIR', path.join(process.cwd(), 'rulesets'));
  const output = env('AI_REVIEW_OUTPUT', 'ai-review.md');
  const { rules, missing } = readRules(root);
  const { diffText, wasTruncated } = truncateDiff(detectDiff());

  let review;
  if (!diffText.trim()) {
    review = '# AI Code Review\n\nNo diff detected.';
  } else if (env('AI_REVIEW_DRY_RUN', 'false').toLowerCase() === 'true') {
    review = '# AI Code Review Dry Run\n\nRules loaded successfully. Model call skipped.';
  } else {
    const reviewBody = await callModel(buildMessages(rules, diffText, wasTruncated));
    review = `# AI Code Review\n\n${reviewBody}\n`;
  }

  if (missing.length > 0) {
    review += `\n## Missing Rulesets\n\n${missing.map((item) => `- \`${item}\``).join('\n')}\n`;
  }

  fs.writeFileSync(output, review, 'utf8');
  console.log(`AI review written to ${output}`);

  if (env('AI_REVIEW_FAIL_ON_FINDINGS', 'false').toLowerCase() === 'true') {
    const lowered = review.toLowerCase();
    if (['severity', '涓ラ噸', '楂樺嵄', 'critical', 'major'].some((marker) => lowered.includes(marker))) {
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error(`ai_review.js failed: ${error.message}`);
  process.exit(2);
});
