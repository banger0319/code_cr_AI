# AI Code Review — 操作手册

## 目录

- [1. 概述](#1-概述)
- [2. 快速接入](#2-快速接入)
- [3. 输入参数全表](#3-输入参数全表)
- [4. 规则体系](#4-规则体系)
  - [4.1 规则目录结构](#41-规则目录结构)
  - [4.2 Blocking Conditions（阻断条件）](#42-blocking-conditions阻断条件)
  - [4.3 自定义规则](#43-自定义规则)
- [5. Skills 技能系统](#5-skills-技能系统)
  - [5.1 什么是 Skill](#51-什么是-skill)
  - [5.2 创建 Skill](#52-创建-skill)
  - [5.3 Skill 怎么写效果好](#53-skill-怎么写效果好)
- [6. 输出与 Reporter](#6-输出与-reporter)
  - [6.1 summary](#61-summary)
  - [6.2 artifact](#62-artifact)
  - [6.3 pr-comment](#63-pr-comment)
- [7. 阻断策略](#7-阻断策略)
- [8. Dry-run 模式](#8-dry-run-模式)
- [9. 错误处理与 Fail-mode](#9-错误处理与-fail-mode)
- [10. 大 Diff 处理与性能调优](#10-大-diff-处理与性能调优)
- [11. 仓库上下文补充](#11-仓库上下文补充)
- [12. 安全考量](#12-安全考量)
- [13. 故障排查](#13-故障排查)
- [14. 环境变量速查](#14-环境变量速查)

---

## 1. 概述

AI Code Review 是一个可复用的 GitHub Action，用 AI 模型对 Git diff 做代码审查。核心设计原则：

> **AI review 只提供信息，不替人做决定。** 默认仅生成报告，不会让 CI 失败。报告中清晰区分 Blocking / Non-Blocking 发现，由团队审查后自行判断。

### 工作流程

```
Git Push / PR 触发
       │
       ▼
  detectDiff()          ← 自动检测 Git diff 来源
       │
       ▼
  splitDiffByFile()     ← 按文件拆分 diff
       │
       ▼
  filterDiffFiles()     ← 排除不需要审查的文件
       │
       ▼
  chunkDiffFiles()      ← 大 diff 按字节切分
       │
       ▼
  readRules()           ← 加载规则 + Skills
       │
       ▼
  callModel() × N       ← 并发调用 AI 模型（含重试）
       │
       ▼
  parseModelResponse()  ← 解析 JSON 响应
       │
       ▼
  validateReviewJson()  ← 校验 finding 字段
       │
       ▼
  buildCombinedReport() ← 生成 Markdown 报告
       │
       ▼
  输出到 Summary / Artifact / PR Comment
```

---

## 2. 快速接入

在你的业务仓库中创建 `.github/workflows/ai-review.yml`：

```yaml
name: AI Code Review

on:
  push:
    branches: [master]
  pull_request:
    types: [opened, synchronize, reopened]
  workflow_dispatch:

permissions:
  contents: read
  pull-requests: read

jobs:
  ai-review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run AI review
        uses: banger0319/code_cr_AI@main
        with:
          project-types: web
          model: gpt-4.1-mini
          base-url: https://api.openai.com/v1
          api-key: ${{ secrets.AI_REVIEW_API_KEY }}

      - name: Upload AI review report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: ai-review
          path: ai-review.md
```

**三个必填项：**

| 参数 | 说明 |
|------|------|
| `project-types` | 项目类型，决定加载哪些规则。支持 `web`、`flutter`、`embedded`，可逗号组合。 |
| `base-url` | AI API 地址。OpenAI 用 `https://api.openai.com/v1`，其他兼容服务填对应地址。 |
| `api-key` | API 密钥，**务必用 Secrets 传入**，不要硬编码。 |

---

## 3. 输入参数全表

| Input | 默认值 | 说明 |
|-------|--------|------|
| `project-types` | 空 | 项目类型规则目录，逗号分隔。如 `web,flutter`。 |
| `extra-rulesets` | 空 | 额外规则目录（调用方仓库内路径），逗号分隔。 |
| `rulesets-dir` | Action 仓库 `rulesets` | 规则集根目录，可指向调用方仓库自定义规则目录。 |
| `model` | `gpt-4.1-mini` | AI 模型名称。 |
| `base-url` | `https://api.openai.com/v1` | API 基础地址。 |
| `endpoint` | `$base-url/chat/completions` | 完整的 chat completions 端点。 |
| `api-key` | 空 | API 密钥。**必须用 `${{ secrets.XXX }}` 传入。** |
| `language` | `zh-CN` | 审查输出语言。支持 `en`、`ja` 等标准语言标签。 |
| `chunk-bytes` | `60000` | 单次模型审查的最大 diff 字节数。 |
| `max-chunks` | `20` | 最多处理的内部 diff 分片数。 |
| `concurrency` | `3` | 并发模型请求数。 |
| `timeout-seconds` | `600` | 单次模型请求超时时间。 |
| `exclude-paths` | 空 | 逗号分隔的 glob 过滤，跳过无需审查的文件。 |
| `output` | `ai-review.md` | 产物报告路径。 |
| `fail-on-findings` | `false` | 是否在报告出现 Blocking 发现时让 Action 失败。 |
| `strict-rulesets` | `false` | 规则目录缺失时是否失败。 |
| `dry-run` | `false` | 只验证规则和分片，不调用模型。 |
| `reporter` | `summary,artifact` | 输出方式，逗号分隔：`summary`、`artifact`、`pr-comment`。 |
| `github-token` | `${{ github.token }}` | PR 评论所需的 GitHub Token。 |
| `retry-count` | `2` | 模型请求遇到 429/5xx 时的最大重试次数。 |
| `fail-mode` | `fail-open` | 脚本自身出错策略：`fail-open`（仅 warning）、`fail-closed`（退出码 2）。 |
| `max-findings` | `50` | 报告中最多展示的 finding 数量。 |

---

## 4. 规则体系

### 4.1 规则目录结构

规则集统一放在 `rulesets/` 目录下，按项目类型分子目录：

```text
rulesets/
├── web/
│   ├── blocking.md        ← 阻断条件定义
│   └── review.md          ← Web 前端审查规则
├── flutter/
│   ├── blocking.md        ← 阻断条件定义
│   └── skills/
│       └── flutter-fix-layout-issues/
│           └── SKILL.md   ← Skill 文件
├── embedded/
│   ├── blocking.md        ← 阻断条件定义
│   └── review.md          ← 嵌入式审查规则
```

**加载逻辑：**

1. 根据 `project-types` 参数找到对应子目录（如 `rulesets/web`）
2. **递归读取**该目录下所有 `.md` 文件
3. 如果文件路径包含 `/skills/`，按 Skill 格式解析（需要 YAML frontmatter）
4. 否则作为普通规则文本加载
5. 合并所有规则文本作为 prompt 的一部分发给模型

**`extra-rulesets` 参数**：可以指向调用方仓库内的额外规则目录，与 Action 自带规则合并使用。

```yaml
with:
  project-types: web
  extra-rulesets: .github/rules/my-custom-rules
```

### 4.2 Blocking Conditions（阻断条件）

每个项目类型目录下的 `blocking.md` 定义什么情况应该标记为 `Blocking: true`。模型会严格依据该文件判断。

**Web 示例：**

```markdown
# Web Blocking Conditions

以下情况必须标记为 `Blocking: true`：
- 新增或暴露密钥、token、密码、私钥、内部服务地址等敏感信息。
- 引入明确的 XSS、SQL 注入、命令注入、路径穿越、SSRF 等高危漏洞。
...

以下情况通常标记为 `Blocking: false`：
- 仅代码风格、命名、轻微可读性问题。
- 无法仅基于 diff 区分和仓库上下文确认的推测性问题。
```

**Flutter 示例（始终非阻断）：**

```markdown
# Flutter Blocking Conditions

- 不管什么情况，标记为 `Blocking: false`
```

**重要区分：`blocking` ≠ `severity`**

- `blocking: true/false` — 是否阻断流水线，由 blocking.md 规则决定
- `severity: P0/P1/P2/P3` — 严重程度，仅用于展示和排序

默认情况下即使出现 `blocking: true` 也不会让 CI 失败。只有显式设置 `fail-on-findings: 'true'` 时才会触发退出码 1。

### 4.3 自定义规则

在调用方仓库中创建 `.github/rules/` 目录，通过 `extra-rulesets` 加载：

```text
.github/rules/
└── my-custom-rules/
    └── security.md
```

```markdown
<!-- security.md -->
# 自定义安全规则

- 所有用户输入必须经过 validate() 函数校验。
- 数据库查询必须使用参数化查询，禁止字符串拼接 SQL。
- 敏感操作必须记录审计日志。
```

```yaml
with:
  extra-rulesets: .github/rules/my-custom-rules
```

---

## 5. Skills 技能系统

### 5.1 什么是 Skill

Skill 是存放在规则目录 `skills/` 子目录下的专项能力文件，用于教模型如何处理特定类型的代码问题。与普通规则不同，Skill 包含：

- **触发条件**（在 `description` 中描述）
- **详细的处理步骤**（在 body 中描述）
- **示例代码**

模型会在审查 diff 时自动判断是否匹配 Skill 的触发条件，匹配时应用 Skill 中的知识。

### 5.2 创建 Skill

在对应项目类型的 `skills/` 目录下创建子目录和 `SKILL.md` 文件：

```text
rulesets/<project-type>/skills/<skill-name>/SKILL.md
```

**文件格式：**

```markdown
---
name: my-skill-name
description: 一句话描述这个 Skill 的触发场景。模型看到 diff 符合描述时会主动应用。
---

# Skill 正文

这里写详细的知识、检查清单、示例代码等。格式自由，Markdown。
```

**字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | Skill 唯一标识，模型会在 `rule_id` 中引用，如 `flutter.skills.fix-layout.RenderFlex` |
| `description` | 是 | **触发条件描述**。模型用它判断是否应用此 Skill。写得越具体越好。 |
| body | 是 | Skill 正文，包括诊断方法、解决步骤、代码示例。 |

**完整示例：**

```markdown
---
name: flutter-fix-layout-issues
description: Fixes Flutter layout errors (overflows, unbounded constraints). Use when addressing "RenderFlex overflowed", "Vertical viewport was given unbounded height", or similar layout issues.
---

# Resolving Flutter Layout Errors

## Constraint Violation Diagnostics

Diagnose layout failures using the following error signatures:
- **"Vertical viewport was given unbounded height"**: ...
- **"RenderFlex overflowed"**: ...

## Layout Error Resolution Workflow

1. Run the application in debug mode to capture the exact layout exception.
2. Identify the primary error message.
3. Apply the conditional fix based on the specific error type.
...

## Examples

### Fixing Unbounded Height (ListView in Column)

**Input (Error State):**
```dart
Column(
  children: [
    const Text('Header'),
    ListView(...),
  ],
)
```

**Output (Resolved State):**
```dart
Column(
  children: [
    const Text('Header'),
    Expanded(
      child: ListView(...),
    ),
  ],
)
```
```

### 5.3 Skill 怎么写效果好

1. **description 要具体** — 模型用它判断是否匹配。写清楚触发关键词（如 `"RenderFlex overflowed"`）
2. **给出 input → output 示例** — 错误代码和修复后的代码成对展示，效果最好
3. **用一个 Skill 覆盖一类问题** — 不要把不相关的问题塞进同一个 Skill
4. **正文用英文写** — 模型对英文技术内容的理解比中文更精确（报告语言由 `language` 参数控制）
5. **name 用于溯源** — 当模型应用了 Skill，`rule_id` 会包含 Skill 名称，方便追踪

---

## 6. 输出与 Reporter

`reporter` 参数控制报告输出方式，支持逗号组合（如 `summary,artifact,pr-comment`）。

### 6.1 summary

将报告写入 GitHub Actions Step Summary（`$GITHUB_STEP_SUMMARY`），在 Action 运行页面的 Summary 区域可见。

**无需额外配置。**

### 6.2 artifact

生成 `ai-review.md` 文件，通过 `actions/upload-artifact` 上传。

**调用方 workflow 需要添加 upload step：**

```yaml
- name: Upload AI review report
  uses: actions/upload-artifact@v4
  if: always()
  with:
    name: ai-review
    path: ai-review.md
```

### 6.3 pr-comment

将报告以 PR 评论形式发布。**只在 PR 事件中生效。**

**配置要求：**

1. 设置 `reporter: pr-comment`（或 `summary,pr-comment`）
2. 确保 `github-token` 可用（默认 `${{ github.token }}`）
3. workflow 权限需要包含 `pull-requests: write`

```yaml
permissions:
  contents: read
  pull-requests: write    # ← pr-comment 需要

with:
  reporter: summary,artifact,pr-comment
```

**去重机制：** 评论包含 `<!-- ai-review-bot -->` 标记，同一 PR 上多次触发会**更新**已有评论而非重复发布。

---

## 7. 阻断策略

### 默认行为：不阻断

Action 始终生成完整报告，但**不会让流水线失败**。这是有意为之的设计选择 — 团队在 PR 中审查报告后自行决定。

### 开启阻断

```yaml
with:
  fail-on-findings: 'true'
```

当报告中任何 finding 的 `blocking` 字段为 `true` 时，Action 退出码为 1（CI 失败）。

### Blocking 判断流程

```
AI 模型审查 diff
       │
       ▼
读取 rulesets/<type>/blocking.md
       │
       ▼
判断问题是否匹配阻断条件
       │
       ▼
输出: { "blocking": true/false, "severity": "P0-P3", ... }
       │
       ▼
fail-on-findings=true AND blocking=true → CI 失败
```

**关键：`severity` 不直接决定是否阻断。** 只有 `blocking.md` 中描述的规则可以触发 `blocking: true`。这意味着你可以有一个 `severity: P0` 的问题但标记 `blocking: false`，反之亦然（虽然不推荐）。

### 自定义阻断条件

修改调用方仓库中的 `blocking.md`，或通过 `extra-rulesets` 加载额外的阻断规则文件。

---

## 8. Dry-run 模式

不调用 AI 模型，仅验证规则加载、diff 拆分和文件过滤是否正常。

```yaml
with:
  dry-run: 'true'
```

或设置环境变量：

```bash
AI_REVIEW_DRY_RUN=true node scripts/ai_review.js
```

**输出示例：**

```markdown
# AI Code Review Dry Run

Rules loaded successfully. Model call skipped.

Skipped files: 2
```

**适用场景：**
- 首次接入时验证配置是否正确
- 调试规则加载问题
- 验证 exclude-paths 过滤效果

---

## 9. 错误处理与 Fail-mode

`fail-mode` 控制脚本自身出错时的行为（与 AI 审查结果无关）：

| 值 | 行为 |
|----|------|
| `fail-open`（默认） | 出错时打印 warning，退出码 0，**不阻断 CI** |
| `fail-closed` | 出错时退出码 2，**CI 失败** |

**适用场景：**
- 关键项目建议设 `fail-closed`，确保审查一定执行
- 非关键项目用默认的 `fail-open`，避免审查工具本身成为瓶颈

---

## 10. 大 Diff 处理与性能调优

### 处理流程

```
splitDiffByFile (按文件拆分)
       │
       ▼
filterDiffFiles (排除无需审查的文件)
       │
       ▼
chunkDiffFiles (按字节切分，默认 60KB/chunk)
       │
       ▼
并发调用模型 (默认 3 并发)
```

### 调优参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `chunk-bytes` | `60000` | 单 chunk 最大字节数。减小可以降低模型超时概率，但增加 chunk 数量。 |
| `max-chunks` | `20` | 最多处理的 chunk 数。超出部分会被跳过并在报告中提示。 |
| `concurrency` | `3` | 并发数。增加可以加快大 diff 审查速度，但注意 API rate limit。 |
| `timeout-seconds` | `600` | 单次请求超时。大 chunk 或慢模型可能需要增大。 |
| `retry-count` | `2` | 429/5xx 重试次数。每次重试间隔指数增长（1s → 2s → 4s）。 |

### 超限提示

当 diff 太大导致部分 chunk 被跳过时，报告会显示：

> Some diff content was not reviewed because the max internal review limit was reached. Please split this change if needed.

---

## 11. 仓库上下文补充

为降低 diff-only 的误报率，Action 会自动为模型补充仓库上下文：

1. **文件索引** — 通过 `git ls-files` 生成完整文件列表（上限 5000 个文件）
2. **引用解析** — 自动识别新增代码中的 `import`/`require`/`import()`，如果引用本地已有文件，读取该文件部分内容
3. **Prompt 约束** — 明确要求模型不能因为文件未出现在 diff 中就断言引用不存在

调优参数：

| 环境变量 | 默认 | 说明 |
|----------|------|------|
| `AI_REVIEW_MAX_FILE_INDEX` | `5000` | 文件索引最大条目数 |
| `AI_REVIEW_MAX_REFERENCED_FILES` | `20` | 最多读取的引用文件数 |
| `AI_REVIEW_MAX_REFERENCED_FILE_BYTES` | `12000` | 每个引用文件最大读取字节数 |

---

## 12. 安全考量

### API Key 保护

- **永远不要**在 workflow 文件中硬编码 `api-key`
- 使用 GitHub Secrets：`${{ secrets.AI_REVIEW_API_KEY }}`
- 确保使用 HTTPS 端点，否则会有 warning

### Prompt Injection 防护

脚本内建了多层 prompt injection 防护：

1. **System prompt 硬约束** — 明确指示模型将 diff 内容视为数据而非指令
2. **结构化 JSON 输出** — 强制 JSON 格式，模型无法通过输出内容影响 Markdown 解析
3. **JSON Schema 校验** — 所有字段类型和值域都有严格校验，非法输出会被丢弃并重试
4. **语言参数净化** — `language` 参数用正则 `^[a-zA-Z]{2,4}(-[a-zA-Z0-9]{2,8})?$` 校验，防止注入

### 路径安全

- `resolveLocalImport()` 拒绝包含 `..` 的路径（防止目录穿越）
- diff 文件路径统一 `normalizePath()` 处理，去除 `a/`/`b/` 前缀和反斜杠

### 错误处理安全

- `getPrInfo()` 只捕获 `SyntaxError`，其他异常正常抛出
- 模型响应解析失败时自动重试一次，仍失败则安全降级为空 finding
- 网络超时有明确的超时控制和错误信息

---

## 13. 故障排查

### 模型返回 429 (Rate Limit)

**症状：** 日志中出现 `Model request failed with HTTP 429`

**解决：**
- 降低 `concurrency`（如 `concurrency: '1'`）
- 增大 `retry-count`（如 `retry-count: '5'`）
- 检查 API 服务的 rate limit 配额

### 模型请求超时

**症状：** 日志中出现 `AI model request timed out after 600 seconds`

**解决：**
- 减小 `chunk-bytes`（如 `chunk-bytes: '30000'`）
- 增大 `timeout-seconds`（如 `timeout-seconds: '900'`）
- 减少单次 PR 的变更量

### 规则未生效

**症状：** AI 审查结果没有按照预期规则判断

**排查：**
1. 先用 dry-run 确认规则文件是否被加载：`dry-run: 'true'`
2. 检查报告底部的 `## Loaded Rule Files` 列表
3. 确认规则文件在正确的项目类型目录下
4. 确认 `project-types` 参数拼写正确

### PR 评论未出现

**症状：** 开启了 `pr-comment` 但没有看到评论

**排查：**
1. 确认 workflow 有 `pull-requests: write` 权限
2. 确认是 PR 事件触发（push 事件不会发 PR 评论）
3. 检查 `github-token` 是否正确传入
4. 查看 Action 日志中是否有 `Posted new PR comment` 或错误信息

### JSON 解析失败

**症状：** 日志中出现 `Failed to parse JSON from model response. Retrying once.`

**说明：** 这是正常的容错机制。模型偶尔输出格式不符合 JSON，脚本会自动重试一次。如果重试也失败，该 chunk 会被跳过并在报告中标注。

**如果频繁发生：**
- 检查模型是否支持 JSON 输出
- 考虑换用能力更强的模型

### 本地运行测试

```bash
# 运行所有测试
node --test test/ai_review.test.js

# 本地 dry-run
AI_REVIEW_DRY_RUN=true \
AI_REVIEW_PROJECT_TYPES=web \
node scripts/ai_review.js
```

---

## 14. 环境变量速查

所有 Action input 都映射为 `AI_REVIEW_<NAME>_INPUT` 格式。此外以下环境变量可在本地调试时直接使用：

| 变量 | 说明 |
|------|------|
| `AI_REVIEW_DIFF` | 直接传入 diff 文本（跳过 git diff） |
| `AI_REVIEW_DIFF_FILE` | 从文件读取 diff |
| `AI_REVIEW_DIFF_RANGE` | 自定义 git diff 参数，如 `origin/main...HEAD` |
| `AI_REVIEW_DRY_RUN` | 设为 `true` 跳过模型调用 |
| `AI_REVIEW_FAIL_MODE` | `fail-open` 或 `fail-closed` |
| `GITHUB_STEP_SUMMARY` | Step Summary 文件路径（CI 自动设置） |
| `GITHUB_EVENT_NAME` | 事件名称（CI 自动设置） |
| `GITHUB_EVENT_PATH` | 事件 JSON 路径（CI 自动设置） |
