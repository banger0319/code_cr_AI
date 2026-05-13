# GitHub AI Code Review Action

这个仓库提供一个可复用的 GitHub Action，用 AI 对触发项目的 Git diff 做 Code Review。业务项目只需要引用本 Action，并配置项目类型、模型地址和 API Key。

## 最小接入示例

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

> **设计原则：AI review 只提供信息，不替人做决定。** Action 仅生成报告，不会让流水线失败。报告中会清晰区分 Blocking / Non-Blocking 发现，由团队审查后自行判断。

## 大 Diff 处理

大 diff 处理是内部实现细节，最终用户只会看到整理后的完整报告：

- 内部按文件和大小拆分 diff，降低模型超时概率。
- 默认最多处理 `20` 个内部分片，超出时最终报告提示"部分 diff 未被审查"。
- 默认并发请求模型：`3`。
- 默认模型请求超时：`600` 秒。
- 模型请求限流时最多重试 `5` 次（内置，不可配置）。
- 最终报告统一整理为 `Summary`、`Blocking Findings`、`Non-Blocking Findings`、`Notes`。
- Action **不会**因为发现 Blocking 问题而让流水线失败，始终走完完整审查流程。
- 规则集目录缺失时仅提示未读取到规则，流水线继续执行。

默认不排除任何文件。无需 CR 的文件类型建议由被 CR 项目按自身情况配置：

```yaml
with:
  exclude-paths: 'package-lock.json,pnpm-lock.yaml,yarn.lock,dist/**,build/**,coverage/**,*.map,*.png,*.jpg,*.svg'
```

如需覆盖内部处理策略，也可以配置：

```yaml
with:
  chunk-bytes: '60000'
  max-chunks: '20'
  concurrency: '3'
  timeout-seconds: '600'
```

## 仓库上下文补充

为降低 diff-only 误报，Action 会自动给模型补充仓库上下文：

- 通过 `git ls-files` 生成当前仓库文件索引。
- 自动解析新增代码里的本地 `import` / `require` / dynamic `import()`。
- 如果引用的是仓库中已存在的本地文件，会读取该文件部分内容作为上下文。
- Prompt 明确要求：不能仅因为文件没出现在本次 diff 中，就断言本地引用文件不存在。

默认限制：

```text
AI_REVIEW_MAX_FILE_INDEX=5000
AI_REVIEW_MAX_REFERENCED_FILES=20
AI_REVIEW_MAX_REFERENCED_FILE_BYTES=12000
```

## 规则集机制

- `project-types` 支持逗号分隔，例如 `flutter`、`web`、`embedded`、`web,embedded`。
- `project-types: web` 会读取 `rulesets/web` 下所有 `.md` 文件，包括子目录。
- 加载顺序是：项目类型规则 → `extra-rulesets`。
- `rulesets-dir` 默认指向本 Action 仓库的 `rulesets`，也可以改成调用方仓库内的规则目录。
- 规则集目录缺失时，仅提示未读取到规则，**不会导致流水线失败**。

## 阻断条件

Action **始终生成完整报告，永远不会让流水线失败**。报告中的 Blocking / Non-Blocking 区分仅供团队审查时参考。

阻断判断由规则目录下的 `blocking.md` 描述：

```text
rulesets/web/blocking.md
rulesets/flutter/blocking.md
rulesets/embedded/blocking.md
```

模型会为每个问题输出：

```text
Blocking: true|false
Severity: P0|P1|P2|P3
```

## Skills 技能系统

规则目录下的 `skills/` 子目录可以存放专项技能文件，模型在审查代码时自动匹配并应用。详见 [OPERATIONS_MANUAL.md](OPERATIONS_MANUAL.md)。

## 规则目录组织建议

技术栈文件夹下可以同时放强规则和专项能力文档，例如 Flutter：

```text
rulesets/flutter/
├── blocking.md
├── review.md
└── skills/
    └── flutter-fix-layout-issues/
        └── SKILL.md
```

脚本递归读取 `rulesets/flutter/**/*.md`，全部作为评审规范发送给模型。包含 `/skills/` 路径的文件按 Skill 格式解析（需 YAML frontmatter），其余作为普通规则。

## 输出

CR 结果会同时出现在三个地方：

1. GitHub Actions 日志中，搜索 `AI REVIEW REPORT START` 可以直接查看完整报告。
2. GitHub Actions run 的 Step Summary 中（`GITHUB_STEP_SUMMARY`）。
3. `ai-review.md` artifact 中，适合下载归档。

## 输入参数

| Input | 默认值 | 说明 |
| --- | --- | --- |
| `project-types` | 空 | 项目类型规则目录，逗号分隔。 |
| `extra-rulesets` | 空 | 额外规则目录，逗号分隔。 |
| `rulesets-dir` | Action 仓库 `rulesets` | 规则集根目录。 |
| `model` | 空 | 可选覆盖；默认读取 `AI_REVIEW_MODEL`，再使用脚本默认值。 |
| `base-url` | 空 | 可选覆盖；默认读取 `AI_REVIEW_BASE_URL`，再使用脚本默认值。 |
| `endpoint` | 空 | 可选覆盖；默认读取 `AI_REVIEW_ENDPOINT`，否则使用 `$AI_REVIEW_BASE_URL/chat/completions`。 |
| `api-key` | 空 | 可选覆盖；默认读取 `AI_REVIEW_API_KEY`。 |
| `language` | `zh-CN` | Review 输出语言。 |
| `chunk-bytes` | `60000` | 内部单次模型审查的最大 diff 字节数。 |
| `max-chunks` | `20` | 最多处理的内部 diff 分片数。 |
| `concurrency` | `3` | 并发模型请求数。 |
| `timeout-seconds` | `600` | 单次模型请求超时时间。 |
| `exclude-paths` | 空 | 逗号分隔的过滤 glob，由被 CR 项目按需配置。 |
| `output` | `ai-review.md` | 产物报告路径。 |
| `dry-run` | `false` | 只验证规则、diff 分片和过滤，不调用模型。 |
