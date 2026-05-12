# GitHub AI Code Review Action

这个仓库提供一个可复用的 GitHub Action，用 AI 对触发项目的 Git diff 做 Code Review。业务项目只需要引用本 Action，并配置项目类型、模型地址和 API Key。

## 最小接入示例

在被 CR 项目中创建 `.github/workflows/ai-review.yml`：

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
          api-key: sk-xxxxxx
          fail-on-findings: 'true'

      - name: Upload AI review report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: ai-review
          path: ai-review.md
```

## 大 diff 处理

大 diff 分片处理已经内置在本 Action 中，业务项目默认不需要配置：

- 默认按文件和大小切分 diff：每个 chunk 约 `60000` bytes。
- 默认最多审查 `20` 个 chunk，超出部分会在报告中标记 omitted。
- 默认并发请求模型：`3`。
- 默认模型请求超时：`600` 秒。
- 最终会汇总所有 chunk 的报告。
- 任一 chunk 出现 `P0` 或 `P1`，且启用 `fail-on-findings: 'true'`，流水线失败。

默认不排除任何文件。无需 CR 的文件类型建议由被 CR 项目按自身情况配置：

```yaml
with:
  exclude-paths: 'package-lock.json,pnpm-lock.yaml,yarn.lock,dist/**,build/**,coverage/**,*.map,*.png,*.jpg,*.svg'
```

如需覆盖分片策略，也可以配置：

```yaml
with:
  chunk-bytes: '60000'
  max-chunks: '20'
  concurrency: '3'
  timeout-seconds: '600'
```

## 规则集机制

- `project-types` 支持逗号分隔，例如 `flutter`、`web`、`embedded`、`web,embedded`。
- `project-types: web` 会读取 `rulesets/web` 下所有 `.md` 文件，包括子目录。
- 加载顺序是：项目类型规则 → `extra-rulesets`。
- `rulesets-dir` 默认指向本 Action 仓库的 `rulesets`，也可以改成调用方仓库内的规则目录。

## 规则目录组织建议

技术栈文件夹下可以同时放强规则和专项能力文档，例如 Flutter：

```text
rulesets/flutter/review.md
rulesets/flutter/skills/flutter-fix-layout-issues/SKILL.md
rulesets/flutter/performance.md
```

脚本不会区分“基础规则”和“专项能力文档”，只会递归读取 `rulesets/flutter/**/*.md`，全部作为评审规范发送给模型。

## 输出与阻断

CR 结果会同时出现在三个地方：

1. GitHub Actions 日志中，搜索 `AI REVIEW REPORT START` 可以直接查看完整报告。
2. GitHub Actions run 的 Step Summary 中，如果当前 runner 提供 `GITHUB_STEP_SUMMARY`。
3. `ai-review.md` artifact 中，适合下载归档。

模型被要求按以下等级输出问题：

```text
P0: 阻断发布、严重安全问题、数据丢失、严重运行时故障
P1: 高风险正确性、安全、兼容性或可维护性问题
P2: 中风险问题
P3: 轻微问题或建议
```

当配置：

```yaml
with:
  fail-on-findings: 'true'
```

脚本会扫描最终汇总报告；只要出现 `P0` 或 `P1`，Action 退出码为 1，流水线不通过。

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
| `chunk-bytes` | `60000` | 每个 AI review chunk 的最大字节数。 |
| `max-chunks` | `20` | 最多审查的 chunk 数。 |
| `concurrency` | `3` | 并发模型请求数。 |
| `timeout-seconds` | `600` | 单次模型请求超时时间。 |
| `exclude-paths` | 空 | 逗号分隔的过滤 glob，由被 CR 项目按需配置。 |
| `output` | `ai-review.md` | 产物报告路径。 |
| `fail-on-findings` | `false` | 是否在报告出现 `P0` 或 `P1` 时让 action 失败。 |
| `strict-rulesets` | `false` | 规则集目录缺失时是否失败。 |
| `dry-run` | `false` | 只验证规则、diff 分片和过滤，不调用模型。 |

## 本地验证

```bash
AI_REVIEW_DRY_RUN=true \
AI_REVIEW_PROJECT_TYPES=flutter \
AI_REVIEW_RULESETS_DIR=rulesets \
AI_REVIEW_API_KEY=dry-run-placeholder \
AI_REVIEW_DIFF='diff --git a/lib/a.dart b/lib/a.dart
+Text("hello")' \
node scripts/ai_review.js
```
