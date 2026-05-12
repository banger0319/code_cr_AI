# GitHub AI Code Review Action

这个仓库提供一个可复用的 GitHub Action，用 AI 对触发项目的 Git diff 做 Code Review。其它 Web、Flutter、嵌入式项目只要在自己的 workflow 中引用本 Action，就可以在 `git push` 或 PR 时自动触发 CR。

## 你的目标流程

- 业务项目 `git push` 后触发 GitHub Actions。
- Action 根据 `AI_REVIEW_PROJECT_TYPES=web` 读取 `rulesets/web` 目录下所有 `.md` 规则文件。
- `.md` 文件会递归通配读取，例如 `rulesets/web/review.md`、`rulesets/web/security/xss.md` 都会被加载。
- Action 获取本次触发项目的 git diff，并把 diff + 规则一起发送给模型。
- 模型输出 CR 报告到 `ai-review.md`。
- 如果报告里出现 `P0` 或 `P1`，并且启用 `fail-on-findings: 'true'`，流水线失败。

## 目录结构

```text
action.yml                  # GitHub composite action 入口
scripts/ai_review.js        # AI CR 执行脚本，Node.js 标准库实现
rulesets/flutter            # Flutter / Dart 规则，递归读取所有 .md
rulesets/web                # Web / Frontend 规则，递归读取所有 .md
rulesets/embedded           # 嵌入式 / Firmware 规则，递归读取所有 .md
examples                    # 调用方 workflow 示例
```

## Web 项目接入示例

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

env:
  AI_REVIEW_PROJECT_TYPES: web
  AI_REVIEW_MODEL: gpt-4.1-mini
  AI_REVIEW_BASE_URL: https://api.openai.com/v1
  AI_REVIEW_API_KEY: sk-xxxxxx

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
          output: ai-review.md
          fail-on-findings: 'true'

      - name: Upload AI review report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: ai-review
          path: ai-review.md
```

## 环境变量优先

请求地址、模型名称和 API Key 可以先明文放在调用方项目 workflow 的 `env` 中跑通：

```yaml
env:
  AI_REVIEW_MODEL: gpt-4.1-mini
  AI_REVIEW_BASE_URL: https://api.openai.com/v1
  AI_REVIEW_API_KEY: sk-xxxxxx
```

后续建议迁移到 GitHub Secrets / Variables：

```yaml
env:
  AI_REVIEW_MODEL: ${{ vars.AI_REVIEW_MODEL }}
  AI_REVIEW_BASE_URL: ${{ vars.AI_REVIEW_BASE_URL }}
  AI_REVIEW_API_KEY: ${{ secrets.AI_REVIEW_API_KEY }}
```

Action 的 `model`、`base-url`、`endpoint`、`api-key` 仍保留为可选覆盖，优先级是：

```text
with 输入 > 调用方项目环境变量 > 脚本默认值
```

## 规则集机制

- `AI_REVIEW_PROJECT_TYPES` 支持逗号分隔，例如 `flutter`、`web`、`embedded`、`web,embedded`。
- `AI_REVIEW_PROJECT_TYPES=web` 会读取 `rulesets/web` 下所有 `.md` 文件，包括子目录。
- 加载顺序是：项目类型规则 → `AI_REVIEW_EXTRA_RULESETS`。
- `AI_REVIEW_EXTRA_RULESETS` 可用于团队自定义增量规则，例如 `team/security,team/performance`。
- `rulesets-dir` 默认指向本 Action 仓库的 `rulesets`，也可以改成调用方仓库内的规则目录。

调用方自定义规则示例：

```yaml
env:
  AI_REVIEW_PROJECT_TYPES: web
  AI_REVIEW_EXTRA_RULESETS: team/security
  AI_REVIEW_API_KEY: sk-xxxxxx

steps:
  - uses: banger0319/code_cr_AI@main
    with:
      rulesets-dir: ./.ai-review/rulesets
      fail-on-findings: 'true'
```

对应目录：

```text
.ai-review/rulesets/web/review.md
.ai-review/rulesets/team/security/review.md
.ai-review/rulesets/team/security/xss.md
```

## 评级与流水线失败

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

脚本会扫描报告内容；只要出现 `P0` 或 `P1`，Action 退出码为 1，流水线不通过。`P2` 和 `P3` 不会阻断流水线。

## 输入参数

| Input | 默认值 | 说明 |
| --- | --- | --- |
| `project-types` | 空 | 可选覆盖；默认读取 `AI_REVIEW_PROJECT_TYPES`。 |
| `extra-rulesets` | 空 | 可选覆盖；默认读取 `AI_REVIEW_EXTRA_RULESETS`。 |
| `rulesets-dir` | Action 仓库 `rulesets` | 规则集根目录。 |
| `model` | 空 | 可选覆盖；默认读取 `AI_REVIEW_MODEL`，再使用脚本默认值。 |
| `base-url` | 空 | 可选覆盖；默认读取 `AI_REVIEW_BASE_URL`，再使用脚本默认值。 |
| `endpoint` | 空 | 可选覆盖；默认读取 `AI_REVIEW_ENDPOINT`，否则使用 `$AI_REVIEW_BASE_URL/chat/completions`。 |
| `api-key` | 空 | 可选覆盖；默认读取 `AI_REVIEW_API_KEY`。 |
| `language` | `zh-CN` | Review 输出语言。 |
| `max-diff-bytes` | `200000` | 发送给模型的最大 diff 字节数。 |
| `output` | `ai-review.md` | 产物报告路径。 |
| `fail-on-findings` | `false` | 是否在报告出现 `P0` 或 `P1` 时让 action 失败。 |
| `strict-rulesets` | `false` | 规则集目录缺失时是否失败。 |
| `dry-run` | `false` | 只验证规则和 diff，不调用模型。 |

## 本地验证

```bash
AI_REVIEW_DRY_RUN=true \
AI_REVIEW_PROJECT_TYPES=web \
AI_REVIEW_RULESETS_DIR=rulesets \
AI_REVIEW_API_KEY=dry-run-placeholder \
AI_REVIEW_DIFF='diff --git a/a.js b/a.js
+console.log(1)' \
node scripts/ai_review.js
```

## 后续新增项目类型

只需要增加一个同名规则目录，例如：

```text
rulesets/android/review.md
```

调用时配置：

```yaml
env:
  AI_REVIEW_PROJECT_TYPES: android
```
