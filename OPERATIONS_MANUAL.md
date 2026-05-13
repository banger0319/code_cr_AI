# AI Code Review — 操作手册

## 目录

- [1. 概述](#1-概述)
- [2. 快速接入](#2-快速接入)
- [3. 输入参数全表](#3-输入参数全表)
- [4. 规则体系](#4-规则体系)
- [5. Skills 技能系统](#5-skills-技能系统)
- [6. 阻断策略](#6-阻断策略)
- [7. Dry-run 模式](#7-dry-run-模式)
- [8. 大 Diff 处理与性能调优](#8-大-diff-处理与性能调优)
- [9. 仓库上下文补充](#9-仓库上下文补充)
- [10. 安全考量](#10-安全考量)
- [11. 故障排查](#11-故障排查)
- [12. 环境变量速查](#12-环境变量速查)

---

## 1. 概述

AI Code Review 是一个可复用的 GitHub Action，用 AI 模型对 Git diff 做代码审查。核心设计原则：

> **AI review 只提供信息，不替人做决定。** Action 仅生成报告，永远不会让流水线失败。报告中清晰区分 Blocking / Non-Blocking 发现，由团队审查后自行判断。

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
  callModel() × N       ← 并发调用 AI 模型（最多重试 5 次）
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
  输出到 Step Summary + ai-review.md artifact
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
| `dry-run` | `false` | 只验证规则和分片，不调用模型。 |

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
│   ├── review.md          ← Flutter 审查规则
│   └── skills/
│       └── flutter-fix-layout-issues/
│           └── SKILL.md   ← Skill 文件
└── embedded/
    ├── blocking.md        ← 阻断条件定义
    └── review.md          ← 嵌入式审查规则
```

**加载逻辑：**

1. 根据 `project-types` 参数找到对应子目录（如 `rulesets/web`）
2. **递归读取**该目录下所有 `.md` 文件
3. 如果文件路径包含 `/skills/`，按 Skill 格式解析（需要 YAML frontmatter）
4. 否则作为普通规则文本加载
5. 合并所有规则文本作为 prompt 的一部分发给模型
6. 规则集目录缺失时仅在报告中提示，**不会导致流水线失败**

**`extra-rulesets` 参数**：可以指向调用方仓库内的额外规则目录。

```yaml
with:
  project-types: web
  extra-rulesets: .github/rules/my-custom-rules
```

### 4.2 Blocking Conditions（阻断条件）

每个项目类型目录下的 `blocking.md` 定义什么情况应该标记为 `Blocking: true`。模型会严格依据该文件判断。

**重要：Action 永远不会因发现 blocking 问题而让流水线失败。** Blocking/Non-Blocking 区分仅供团队审查时参考。

**重要区分：`blocking` ≠ `severity`**

- `blocking: true/false` — 是否属于阻断性问题，由 blocking.md 规则决定
- `severity: P0/P1/P2/P3` — 严重程度，仅用于展示和排序

### 4.3 自定义规则

在调用方仓库中创建规则目录，通过 `extra-rulesets` 加载：

```yaml
with:
  extra-rulesets: .github/rules/my-custom-rules
```

---

## 5. Skills 技能系统

### 5.1 什么是 Skill

Skill 是存放在规则目录 `skills/` 子目录下的专项能力文件，用于教模型如何处理特定类型的代码问题。

### 5.2 创建 Skill

```text
rulesets/<project-type>/skills/<skill-name>/SKILL.md
```

**文件格式：**

```markdown
---
name: my-skill-name
description: 一句话描述触发场景。模型看到 diff 符合描述时会主动应用。
---

# Skill 正文

详细知识、检查清单、示例代码等。格式自由，Markdown。
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | Skill 唯一标识，模型在 `rule_id` 中引用 |
| `description` | 是 | **触发条件描述**。写得越具体，模型匹配越准确 |
| body | 是 | 包括诊断方法、解决步骤、代码示例 |

### 5.3 Skill 怎么写效果好

1. **description 要具体** — 写清楚触发关键词（如 `"RenderFlex overflowed"`）
2. **给出 input → output 示例** — 错误代码和修复后的代码成对展示
3. **正文用英文写** — 模型对英文技术内容理解更精确（报告语言由 `language` 控制）
4. **在 review.md 中引用 skill** — 引导模型使用（如 "当检查到布局问题时，参考 flutter-fix-layout-issues"）

---

## 6. 阻断策略

Action **固定不阻断**流水线。无论报告中发现多少 Blocking 问题，CI 都不会失败。

报告中始终包含：
- **阻断性发现（Blocking Findings）** — 根据 `blocking.md` 规则标记为 `blocking: true` 的问题
- **非阻断性发现（Non-Blocking Findings）** — `blocking: false` 的问题

团队在 PR 中审查报告后自行判断是否需要修改。

---

## 7. Dry-run 模式

不调用 AI 模型，仅验证规则加载、diff 拆分和文件过滤是否正常。

```yaml
with:
  dry-run: 'true'
```

或：

```bash
AI_REVIEW_DRY_RUN=true node scripts/ai_review.js
```

---

## 8. 大 Diff 处理与性能调优

### 处理流程

```
splitDiffByFile → filterDiffFiles → chunkDiffFiles (默认 60KB/chunk) → 并发调用模型 (3 并发)
```

### 调优参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `chunk-bytes` | `60000` | 单 chunk 最大字节数。减小可降低超时概率。 |
| `max-chunks` | `20` | 最多处理的 chunk 数。超出部分跳过并提示。 |
| `concurrency` | `3` | 并发数。增大可加快速度，注意 API rate limit。 |
| `timeout-seconds` | `600` | 单次请求超时。大 chunk 或慢模型需增大。 |

模型请求遇到 429/5xx 错误时自动重试，最多 **5 次**（内置固定，指数退避：1s → 2s → 4s → 8s → 16s）。

---

## 9. 仓库上下文补充

为降低 diff-only 误报率，Action 自动为模型补充仓库上下文：

- **文件索引** — `git ls-files` 生成文件列表（上限 5000）
- **引用解析** — 识别新增代码中的 `import`/`require`/`import()`，读取引用文件内容
- **Prompt 约束** — 明确要求模型不能因文件未出现在 diff 中而断言不存在

| 环境变量 | 默认 | 说明 |
|----------|------|------|
| `AI_REVIEW_MAX_FILE_INDEX` | `5000` | 文件索引最大条目数 |
| `AI_REVIEW_MAX_REFERENCED_FILES` | `20` | 最多读取的引用文件数 |
| `AI_REVIEW_MAX_REFERENCED_FILE_BYTES` | `12000` | 每个引用文件最大读取字节 |

---

## 10. 安全考量

### API Key 保护

- **永远不要**硬编码 `api-key`，使用 `${{ secrets.AI_REVIEW_API_KEY }}`
- 使用 HTTPS 端点，否则会有 warning

### Prompt Injection 防护

- System prompt 硬约束：将 diff 内容视为数据而非指令
- 强制 JSON 输出 + Schema 校验：非法输出丢弃并重试
- 语言参数净化：正则校验防止注入

### 路径安全

- `resolveLocalImport()` 拒绝包含 `..` 的路径

---

## 11. 故障排查

### 模型返回 429 (Rate Limit)

降低 `concurrency`（如 `concurrency: '1'`），检查 API 配额。

### 模型请求超时

减小 `chunk-bytes`（如 `chunk-bytes: '30000'`）或增大 `timeout-seconds`。

### 规则未生效

1. 用 `dry-run: 'true'` 确认规则文件列表
2. 检查报告底部的 "已加载规则文件"
3. 确认 `project-types` 拼写正确

### JSON 解析失败

日志中出现 "无法从模型响应中解析 JSON，重试一次" 是正常容错机制。频繁出现时考虑换用能力更强的模型。

### 规则集目录不存在

日志中提示 "未找到规则集目录"，流水线继续执行不阻断。

### 本地运行测试

```bash
node --test test/ai_review.test.js
AI_REVIEW_DRY_RUN=true AI_REVIEW_PROJECT_TYPES=web node scripts/ai_review.js
```

---

## 12. 环境变量速查

| 变量 | 说明 |
|------|------|
| `AI_REVIEW_DIFF` | 直接传入 diff 文本（跳过 git diff） |
| `AI_REVIEW_DIFF_FILE` | 从文件读取 diff |
| `AI_REVIEW_DIFF_RANGE` | 自定义 git diff 参数，如 `origin/main...HEAD` |
| `AI_REVIEW_DRY_RUN` | 设为 `true` 跳过模型调用 |
| `GITHUB_STEP_SUMMARY` | Step Summary 文件路径（CI 自动设置） |
| `GITHUB_EVENT_NAME` | 事件名称（CI 自动设置） |
| `GITHUB_EVENT_PATH` | 事件 JSON 路径（CI 自动设置） |
