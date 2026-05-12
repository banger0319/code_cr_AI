#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function env(name, defaultValue = '') {
  return (process.env[name] || defaultValue).trim();
}

function config(name, defaultValue = '') {
  const inputValue = env(`${name}_INPUT`);
  return inputValue || env(name, defaultValue);
}

function numberConfig(name, defaultValue) {
  const value = Number(config(name, String(defaultValue)));
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

function splitCsv(value) {
  return value.replace(/;/g, ',').split(',').map((item) => item.trim()).filter(Boolean);
}

function shellSplit(value) {
  const matches = value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  return matches.map((item) => item.replace(/^['"]|['"]$/g, ''));
}

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = escaped.replace(/\*\*/g, '::DOUBLE_STAR::').replace(/\*/g, '[^/]*').replace(/::DOUBLE_STAR::/g, '.*');
  return new RegExp(`^${regex}$`);
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^a\//, '').replace(/^b\//, '');
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
  if (explicitRange) return runGit(['diff', '--no-ext-diff', ...shellSplit(explicitRange)]);

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

function splitDiffByFile(diffText) {
  const lines = diffText.split(/\r?\n/);
  const files = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (current) files.push(current);
      const match = line.match(/^diff --git a\/(.*?) b\/(.*)$/);
      current = { filePath: match ? normalizePath(match[2]) : 'unknown', lines: [line] };
    } else if (current) {
      current.lines.push(line);
      if (line.startsWith('+++ b/')) current.filePath = normalizePath(line.slice(6));
    } else if (line.trim()) {
      current = { filePath: 'unknown', lines: [line] };
    }
  }
  if (current) files.push(current);
  return files.map((file) => ({ ...file, text: file.lines.join('\n') }));
}

function shouldExclude(filePath, excludeMatchers) {
  const normalized = normalizePath(filePath);
  return excludeMatchers.some((matcher) => matcher.test(normalized) || matcher.test(path.basename(normalized)));
}

function filterDiffFiles(diffFiles) {
  const patterns = splitCsv(config('AI_REVIEW_EXCLUDE_PATHS', ''));
  const excludeMatchers = patterns.map(globToRegExp);
  const reviewed = [];
  const skipped = [];
  for (const file of diffFiles) {
    if (shouldExclude(file.filePath, excludeMatchers)) skipped.push(file.filePath);
    else reviewed.push(file);
  }
  return { reviewed, skipped };
}

function chunkDiffFiles(diffFiles) {
  const chunkBytes = numberConfig('AI_REVIEW_CHUNK_BYTES', 60000);
  const maxChunks = numberConfig('AI_REVIEW_MAX_CHUNKS', 20);
  const chunks = [];
  let currentFiles = [];
  let currentText = '';

  for (const file of diffFiles) {
    const fileText = `${file.text}\n`;
    const fileBytes = Buffer.byteLength(fileText, 'utf8');
    if (currentText && Buffer.byteLength(currentText, 'utf8') + fileBytes > chunkBytes) {
      chunks.push({ text: currentText, files: currentFiles });
      currentText = '';
      currentFiles = [];
    }
    if (fileBytes > chunkBytes) {
      const lines = fileText.split(/\r?\n/);
      let partial = '';
      let part = 1;
      for (const line of lines) {
        const next = `${partial}${line}\n`;
        if (partial && Buffer.byteLength(next, 'utf8') > chunkBytes) {
          chunks.push({ text: partial, files: [`${file.filePath}#part${part}`] });
          partial = '';
          part += 1;
        }
        partial += `${line}\n`;
      }
      if (partial.trim()) chunks.push({ text: partial, files: [`${file.filePath}#part${part}`] });
      continue;
    }
    currentText += fileText;
    currentFiles.push(file.filePath);
  }
  if (currentText.trim()) chunks.push({ text: currentText, files: currentFiles });
  return { chunks: chunks.slice(0, maxChunks), omittedChunks: Math.max(0, chunks.length - maxChunks), totalChunks: chunks.length };
}

function listRepositoryFiles() {
  const output = tryRunGit(['ls-files']);
  if (!output) return [];
  return output.split(/\r?\n/).map(normalizePath).filter(Boolean).sort();
}

function resolveLocalImport(fromFile, specifier, repositoryFiles) {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null;
  const fromDir = path.posix.dirname(normalizePath(fromFile));
  const base = normalizePath(path.posix.normalize(path.posix.join(fromDir, specifier)));
  const candidates = [
    base,
    `${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`, `${base}.vue`, `${base}.dart`,
    `${base}.json`, `${base}.mjs`, `${base}.cjs`,
    `${base}/index.js`, `${base}/index.jsx`, `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.vue`, `${base}/index.dart`,
  ];
  return candidates.find((candidate) => repositoryFiles.includes(candidate)) || null;
}

function extractLocalImportSpecifiers(diffText) {
  const specs = [];
  const lines = diffText.split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const code = line.slice(1);
    const patterns = [
      /import\s+(?:[^'";]+\s+from\s+)?['"]([^'"]+)['"]/g,
      /export\s+(?:[^'";]+\s+from\s+)?['"]([^'"]+)['"]/g,
      /require\(\s*['"]([^'"]+)['"]\s*\)/g,
      /import\(\s*['"]([^'"]+)['"]\s*\)/g,
      /import\s+['"]([^'"]+)['"]/g,
    ];
    for (const pattern of patterns) {
      for (const match of code.matchAll(pattern)) {
        if (match[1] && (match[1].startsWith('.') || match[1].startsWith('/'))) specs.push(match[1]);
      }
    }
  }
  return specs;
}

function collectReferencedFiles(diffFiles, repositoryFiles) {
  const maxFiles = numberConfig('AI_REVIEW_MAX_REFERENCED_FILES', 20);
  const maxBytes = numberConfig('AI_REVIEW_MAX_REFERENCED_FILE_BYTES', 12000);
  const referenced = [];
  const seen = new Set();
  for (const file of diffFiles) {
    for (const specifier of extractLocalImportSpecifiers(file.text)) {
      const resolved = resolveLocalImport(file.filePath, specifier, repositoryFiles);
      if (!resolved || seen.has(resolved) || !fs.existsSync(resolved)) continue;
      seen.add(resolved);
      const content = fs.readFileSync(resolved, 'utf8');
      referenced.push({
        filePath: resolved,
        content: Buffer.from(content, 'utf8').subarray(0, maxBytes).toString('utf8'),
        truncated: Buffer.byteLength(content, 'utf8') > maxBytes,
      });
      if (referenced.length >= maxFiles) return referenced;
    }
  }
  return referenced;
}

function buildRepositoryContext(repositoryFiles, referencedFiles) {
  const maxIndex = numberConfig('AI_REVIEW_MAX_FILE_INDEX', 5000);
  const visibleFiles = repositoryFiles.slice(0, maxIndex);
  const parts = [
    '# Repository File Index',
    '',
    ...visibleFiles.map((file) => `- ${file}`),
  ];
  if (repositoryFiles.length > visibleFiles.length) {
    parts.push(`- ... ${repositoryFiles.length - visibleFiles.length} more files omitted`);
  }
  if (referencedFiles.length > 0) {
    parts.push('', '# Referenced Existing Files', '');
    for (const file of referencedFiles) {
      parts.push(`## ${file.filePath}`, '', '```', file.content, '```', file.truncated ? '_File content truncated._' : '', '');
    }
  }
  return parts.join('\n');
}

function walkMarkdownFiles(dir) {
  const result = [];
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walkMarkdownFiles(fullPath));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) result.push(fullPath);
  }
  return result.sort();
}

function rulesetDirs(root) {
  return [...splitCsv(config('AI_REVIEW_PROJECT_TYPES', '')), ...splitCsv(config('AI_REVIEW_EXTRA_RULESETS', ''))].map((item) => path.join(root, item));
}

function readRules(root) {
  const sections = [];
  const missing = [];
  const loadedFiles = [];
  for (const rulesDir of rulesetDirs(root)) {
    if (!fs.existsSync(rulesDir)) {
      missing.push(rulesDir);
      continue;
    }
    for (const filePath of walkMarkdownFiles(rulesDir)) {
      const content = fs.readFileSync(filePath, 'utf8').trim();
      if (content) {
        loadedFiles.push(path.relative(root, filePath));
        sections.push(`## ${path.relative(root, filePath)}\n\n${content}`);
      }
    }
  }
  if (missing.length > 0 && config('AI_REVIEW_STRICT_RULESETS', 'false').toLowerCase() === 'true') {
    throw new Error(`Missing rulesets: ${missing.join(', ')}`);
  }
  return { rules: sections.join('\n\n'), missing, loadedFiles };
}

function buildMessages(rules, repositoryContext, diffText, wasTruncated) {
  const language = config('AI_REVIEW_LANGUAGE', 'zh-CN');
  const truncationNote = wasTruncated ? 'Some diff content was omitted because AI_REVIEW_MAX_CHUNKS was reached.' : 'Review this diff as part of the full change set.';
  const system = `You are a senior code reviewer. Review only the supplied git diff. Respond in ${language}.
Use the supplied markdown rules as mandatory review criteria. Use the repository file index to verify whether referenced files exist.
For every finding, use this exact format:
- Severity: P0|P1|P2|P3
- File: path or unknown
- Rule: violated rule summary
- Reason: concise reason based on the diff
- Fix: concrete suggested fix
Severity definition: P0 blocks release or causes critical security/data-loss/runtime failure; P1 is high-risk correctness, security, compatibility, or maintainability issue; P2 is medium risk; P3 is minor/nit.
Do not mention chunks or chunking. Do not invent files or issues not supported by the diff. Do not claim an imported or referenced local file is missing unless the repository file index confirms it is absent. If the file exists in the index but its contents are not shown, treat it as existing context rather than a missing file. If no substantive issue exists, say no blocking findings.`;
  const user = `# Review Rules\n\n${rules || 'No custom rules were provided.'}\n\n# Repository Context\n\n${repositoryContext || 'No repository context was provided.'}\n\n# Diff Context\n\n${truncationNote}\n\n\`\`\`diff\n${diffText}\n\`\`\``;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

async function callModel(messages) {
  const apiKey = config('AI_REVIEW_API_KEY');
  if (!apiKey) throw new Error('AI_REVIEW_API_KEY is required');
  const baseUrl = config('AI_REVIEW_BASE_URL', 'https://api.openai.com/v1').replace(/\/$/, '');
  const endpoint = config('AI_REVIEW_ENDPOINT', `${baseUrl}/chat/completions`);
  const payload = { model: config('AI_REVIEW_MODEL', 'gpt-4.1-mini'), messages, temperature: Number(config('AI_REVIEW_TEMPERATURE', '0.1')) };
  const maxTokens = config('AI_REVIEW_MAX_TOKENS');
  if (maxTokens) payload.max_tokens = Number(maxTokens);

  const controller = new AbortController();
  const timeoutSeconds = numberConfig('AI_REVIEW_TIMEOUT_SECONDS', 600);
  const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
    const text = await response.text();
    if (!response.ok) throw new Error(`Model request failed: HTTP ${response.status}: ${text}`);
    const data = JSON.parse(text);
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) throw new Error(`Unexpected model response: ${text.slice(0, 1000)}`);
    return content.trim();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`AI model request timed out after ${timeoutSeconds} seconds. Reduce diff size or increase AI_REVIEW_TIMEOUT_SECONDS.`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

async function reviewChunks(rules, chunks, omittedChunks) {
  const concurrency = numberConfig('AI_REVIEW_CONCURRENCY', 3);
  return runWithConcurrency(chunks, concurrency, async (chunk, index) => {
    console.log(`Reviewing diff part ${index + 1}/${chunks.length}`);
    const content = await callModel(buildMessages(rules, chunk.repositoryContext, chunk.text, omittedChunks > 0 && index === chunks.length - 1));
    return { files: chunk.files, content };
  });
}

function buildDryRunReport(loadedFiles, skippedFiles, omittedChunks) {
  const parts = ['# AI Code Review Dry Run', '', 'Rules loaded successfully. Model call skipped.', ''];
  if (skippedFiles.length > 0) parts.push(`Skipped files: ${skippedFiles.length}`, '');
  if (omittedChunks > 0) parts.push('Some diff content would be omitted by the current max chunk limit.', '');
  return parts.join('\n');
}

function extractFindingBlocks(text) {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const matches = [...normalized.matchAll(/(?:^|\n)(?:[-*]\s*)?Severity:\s*(P[0-3])[\s\S]*?(?=\n(?:[-*]\s*)?Severity:\s*P[0-3]|$)/gi)];
  if (matches.length === 0) return [normalized];
  return matches.map((match) => match[0].trim());
}

function groupFindings(chunkReports) {
  const grouped = { blocking: [], nonBlocking: [], notes: [] };
  for (const report of chunkReports) {
    for (const block of extractFindingBlocks(report.content)) {
      if (/(^|[^A-Z0-9])(P0|P1)([^A-Z0-9]|$)/i.test(block)) grouped.blocking.push(block);
      else if (/(^|[^A-Z0-9])(P2|P3)([^A-Z0-9]|$)/i.test(block)) grouped.nonBlocking.push(block);
      else grouped.notes.push(block);
    }
  }
  return grouped;
}

function maxSeverityFromGroups(grouped) {
  const all = [...grouped.blocking, ...grouped.nonBlocking, ...grouped.notes].join('\n');
  for (const severity of ['P0', 'P1', 'P2', 'P3']) {
    if (new RegExp(`(^|[^A-Z0-9])${severity}([^A-Z0-9]|$)`, 'i').test(all)) return severity;
  }
  return 'none';
}

function renderFindingList(items) {
  if (items.length === 0) return ['None'];
  return items.map((item, index) => `### ${index + 1}\n\n${item}`);
}

function buildCombinedReport(chunkReports, metadata) {
  const grouped = groupFindings(chunkReports);
  const maxSeverity = maxSeverityFromGroups(grouped);
  const findingsCount = grouped.blocking.length + grouped.nonBlocking.length;
  const parts = ['# AI Code Review', '', '## Summary', '', `- Overall Severity: ${maxSeverity.toUpperCase()}`, `- Findings: ${findingsCount}`, `- Reviewed Files: ${metadata.reviewedFiles.length}`, `- Skipped Files: ${metadata.skippedFiles.length}`, ''];
  if (metadata.omittedChunks > 0) parts.push('> Some diff content was not reviewed because the max internal review limit was reached. Please split this change if needed.', '');
  if (grouped.blocking.length > 0) parts.push('## Blocking Findings', '', ...renderFindingList(grouped.blocking), '');
  if (grouped.nonBlocking.length > 0) parts.push('## Non-Blocking Findings', '', ...renderFindingList(grouped.nonBlocking), '');
  if (grouped.notes.length > 0) parts.push('## Notes', '', ...grouped.notes, '');
  if (metadata.skippedFiles.length > 0) parts.push('## Skipped Files', '', ...metadata.skippedFiles.map((file) => `- \`${file}\``), '');
  return parts.join('\n');
}

function printReviewToLog(review) {
  console.log('\n========== AI REVIEW REPORT START ==========\n');
  console.log(review);
  console.log('\n========== AI REVIEW REPORT END ==========\n');
}

function writeGitHubSummary(review) {
  const summaryPath = env('GITHUB_STEP_SUMMARY');
  if (!summaryPath) return;
  fs.appendFileSync(summaryPath, `${review}\n`, 'utf8');
}

function hasBlockingSeverity(review) {
  return /(^|[^A-Z0-9])(P0|P1)([^A-Z0-9]|$)/i.test(review);
}

async function main() {
  const root = config('AI_REVIEW_RULESETS_DIR', path.join(process.cwd(), 'rulesets'));
  const output = config('AI_REVIEW_OUTPUT', 'ai-review.md');
  const { rules, missing, loadedFiles } = readRules(root);
  const diffText = detectDiff();
  const diffFiles = splitDiffByFile(diffText);
  const { reviewed, skipped } = filterDiffFiles(diffFiles);
  const repositoryFiles = listRepositoryFiles();
  const referencedFiles = collectReferencedFiles(reviewed, repositoryFiles);
  const repositoryContext = buildRepositoryContext(repositoryFiles, referencedFiles);
  const { chunks, omittedChunks } = chunkDiffFiles(reviewed);
  for (const chunk of chunks) chunk.repositoryContext = repositoryContext;

  let review;
  if (!diffText.trim() || chunks.length === 0) {
    review = '# AI Code Review\n\nNo reviewable diff detected.';
  } else if (config('AI_REVIEW_DRY_RUN', 'false').toLowerCase() === 'true') {
    review = buildDryRunReport(loadedFiles, skipped, omittedChunks);
  } else {
    const chunkReports = await reviewChunks(rules, chunks, omittedChunks);
    review = buildCombinedReport(chunkReports, { skippedFiles: skipped, reviewedFiles: reviewed.map((item) => item.filePath), omittedChunks });
  }

  if (loadedFiles.length > 0) review += `\n## Loaded Rule Files\n\n${loadedFiles.map((item) => `- \`${item}\``).join('\n')}\n`;
  if (missing.length > 0) review += `\n## Missing Rulesets\n\n${missing.map((item) => `- \`${item}\``).join('\n')}\n`;

  fs.writeFileSync(output, review, 'utf8');
  printReviewToLog(review);
  writeGitHubSummary(review);
  console.log(`AI review written to ${output}`);

  if (config('AI_REVIEW_FAIL_ON_FINDINGS', 'false').toLowerCase() === 'true' && hasBlockingSeverity(review)) {
    console.error('Blocking AI review severity detected: P0/P1.');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`ai_review.js failed: ${error.message}`);
  process.exit(2);
});