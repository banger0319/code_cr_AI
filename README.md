# GitHub AI Code Review Action

这个仓库提供一个可复用的 GitHub Action，用 AI 对 Pull Request 的 diff 做 Code Review。调用方通过 `uses` 引入本 Action，再通过参数指定项目类型、规则集和模型连接信息。

## 目录结构

```text
action.yml                  # GitHub composite action 入口
scripts/ai_review.js        # AI CR 执行脚本，Node.js 标准库实现
rulesets/flutter            # Flutter / Dart 规则
rulesets/web                # Web / Frontend 规则
rulesets/embedded           # 嵌入式 / Firmware 规则
examples                    # 调用方 workflow 示例
```

## 快速测试

先把本仓库推到 GitHub，例如 `your-org/ai-review-action`，然后在业务仓库创建 `.github/workflows/ai-review.yml`：

```yaml
name: AI Code Review

on:
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
        uses: your-org/ai-review-action@main
        with:
          project-types: web
          model: gpt-4.1-mini
          base-url: https://api.openai.com/v1
          api-key: ${{ secrets.OPENAI_API_KEY }}
          output: ai-review.md

      - name: Upload AI review report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: ai-review
          path: ai-review.md
```

只验证规则加载和 diff 获取，不调用模型：

```yaml
- name: Validate AI review action
  uses: your-org/ai-review-action@main
  with:
    project-types: flutter
    dry-run: 'true'
    api-key: dry-run-placeholder
```

## 规则集机制

- `project-types` 支持逗号分隔，例如 `flutter`、`web`、`embedded`、`web,embedded`。
- 加载顺序是：项目类型规则 → `extra-rulesets`。
- `extra-rulesets` 可用于团队自定义增量规则，例如 `team/security,team/performance`。
- `rulesets-dir` 默认指向本 Action 仓库的 `rulesets`，也可以改成调用方仓库内的规则目录。

调用方自定义规则示例：

```yaml
- uses: your-org/ai-review-action@main
  with:
    rulesets-dir: ./.ai-review/rulesets
    project-types: web
    extra-rulesets: team/security
    api-key: ${{ secrets.OPENAI_API_KEY }}
```

对应目录：

```text
.ai-review/rulesets/web/review.md
.ai-review/rulesets/team/security/review.md
```

## 输入参数

| Input | 默认值 | 说明 |
| --- | --- | --- |
| `project-types` | 空 | 项目类型，逗号分隔，例如 `flutter`、`web`、`embedded`。 |
| `extra-rulesets` | 空 | 额外规则集目录，逗号分隔。 |
| `rulesets-dir` | Action 仓库 `rulesets` | 规则集根目录。 |
| `model` | `gpt-4.1-mini` | 模型名称。 |
| `base-url` | `https://api.openai.com/v1` | OpenAI-compatible API Base URL。 |
| `endpoint` | `$base-url/chat/completions` | 完整 Chat Completions Endpoint，可覆盖。 |
| `api-key` | 必填 | API Key，建议使用 GitHub Secrets。 |
| `language` | `zh-CN` | Review 输出语言。 |
| `max-diff-bytes` | `200000` | 发送给模型的最大 diff 字节数。 |
| `output` | `ai-review.md` | 产物报告路径。 |
| `fail-on-findings` | `false` | 是否在发现问题时让 action 失败。 |
| `strict-rulesets` | `false` | 规则集目录缺失时是否失败。 |
| `dry-run` | `false` | 只验证规则和 diff，不调用模型。 |

## 本地验证

```bash
AI_REVIEW_DRY_RUN=true \
AI_REVIEW_PROJECT_TYPES=web \
AI_REVIEW_RULESETS_DIR=rulesets \
AI_REVIEW_API_KEY=dry-run-placeholder \
node scripts/ai_review.js
```

如果需要真实调用模型：

```bash
AI_REVIEW_API_KEY=xxx \
AI_REVIEW_BASE_URL=https://api.openai.com/v1 \
AI_REVIEW_MODEL=gpt-4.1-mini \
AI_REVIEW_PROJECT_TYPES=web \
AI_REVIEW_RULESETS_DIR=rulesets \
node scripts/ai_review.js
```

## 后续新增项目类型

只需要增加一个同名规则目录，例如：

```text
rulesets/android/review.md
```

调用时配置：

```yaml
with:
  project-types: android
```
