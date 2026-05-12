# GitHub AI Code Review Action

杩欎釜浠撳簱鎻愪緵涓€涓彲澶嶇敤鐨?GitHub Action锛岀敤 AI 瀵硅Е鍙戦」鐩殑 Git diff 鍋?Code Review銆傚叾瀹?Web銆丗lutter銆佸祵鍏ュ紡椤圭洰鍙鍦ㄨ嚜宸辩殑 workflow 涓紩鐢ㄦ湰 Action锛屽氨鍙互鍦?`git push` 鎴?PR 鏃惰嚜鍔ㄨЕ鍙?CR銆?
## 鐩爣娴佺▼

- 涓氬姟椤圭洰 `git push` 鍚庤Е鍙?GitHub Actions銆?- Action 鏍规嵁 `AI_REVIEW_PROJECT_TYPES=web` 璇诲彇 `rulesets/web` 鐩綍涓嬫墍鏈?`.md` 瑙勫垯鏂囦欢銆?- `.md` 鏂囦欢浼氶€掑綊閫氶厤璇诲彇锛屼緥濡?`rulesets/web/review.md`銆乣rulesets/web/security/xss.md` 閮戒細琚姞杞姐€?- Action 鑾峰彇鏈瑙﹀彂椤圭洰鐨?git diff锛屽苟鎶?diff + 鎶€鏈爤瑙勫垯鐩綍涓嬫墍鏈?md 涓€璧峰彂閫佺粰妯″瀷銆?- 妯″瀷杈撳嚭 CR 鎶ュ憡鍒?`ai-review.md`锛屽悓鏃跺畬鏁存墦鍗板埌 GitHub Actions 鏃ュ織銆?- 濡傛灉鎶ュ憡閲屽嚭鐜?`P0` 鎴?`P1`锛屽苟涓斿惎鐢?`fail-on-findings: 'true'`锛屾祦姘寸嚎澶辫触銆俙GITHUB_STEP_SUMMARY` 鍙敤鏃朵篃浼氭樉绀烘姤鍛婃憳瑕併€?
## 鐩綍缁撴瀯

```text
action.yml                  # GitHub composite action 鍏ュ彛
scripts/ai_review.js        # AI CR 鎵ц鑴氭湰锛孨ode.js 鏍囧噯搴撳疄鐜?rulesets/flutter            # Flutter / Dart 瑙勫垯锛岄€掑綊璇诲彇鎵€鏈?.md
rulesets/web                # Web / Frontend 瑙勫垯锛岄€掑綊璇诲彇鎵€鏈?.md
rulesets/embedded           # 宓屽叆寮?/ Firmware 瑙勫垯锛岄€掑綊璇诲彇鎵€鏈?.md
examples                    # 璋冪敤鏂?workflow 绀轰緥
```

## Web 椤圭洰鎺ュ叆绀轰緥

鍦ㄨ CR 椤圭洰涓垱寤?`.github/workflows/ai-review.yml`锛?
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

## 鐜鍙橀噺浼樺厛

璇锋眰鍦板潃銆佹ā鍨嬪悕绉板拰 API Key 鍙互鍏堟槑鏂囨斁鍦ㄨ皟鐢ㄦ柟椤圭洰 workflow 鐨?`env` 涓窇閫氾細

```yaml
env:
  AI_REVIEW_MODEL: gpt-4.1-mini
  AI_REVIEW_BASE_URL: https://api.openai.com/v1
  AI_REVIEW_API_KEY: sk-xxxxxx
```

鍚庣画寤鸿杩佺Щ鍒?GitHub Secrets / Variables锛?
```yaml
env:
  AI_REVIEW_MODEL: ${{ vars.AI_REVIEW_MODEL }}
  AI_REVIEW_BASE_URL: ${{ vars.AI_REVIEW_BASE_URL }}
  AI_REVIEW_API_KEY: ${{ secrets.AI_REVIEW_API_KEY }}
```

Action 鐨?`model`銆乣base-url`銆乣endpoint`銆乣api-key` 浠嶄繚鐣欎负鍙€夎鐩栵紝浼樺厛绾ф槸锛?
```text
with 杈撳叆 > 璋冪敤鏂归」鐩幆澧冨彉閲?> 鑴氭湰榛樿鍊?```

## 瑙勫垯闆嗘満鍒?
- `AI_REVIEW_PROJECT_TYPES` 鏀寔閫楀彿鍒嗛殧锛屼緥濡?`flutter`銆乣web`銆乣embedded`銆乣web,embedded`銆?- `AI_REVIEW_PROJECT_TYPES=web` 浼氳鍙?`rulesets/web` 涓嬫墍鏈?`.md` 鏂囦欢锛屽寘鎷瓙鐩綍銆?- 鍔犺浇椤哄簭鏄細椤圭洰绫诲瀷瑙勫垯 鈫?`AI_REVIEW_EXTRA_RULESETS`銆?- `AI_REVIEW_EXTRA_RULESETS` 鍙敤浜庡洟闃熻嚜瀹氫箟澧為噺瑙勫垯锛屼緥濡?`team/security,team/performance`銆?- `rulesets-dir` 榛樿鎸囧悜鏈?Action 浠撳簱鐨?`rulesets`锛屼篃鍙互鏀规垚璋冪敤鏂逛粨搴撳唴鐨勮鍒欑洰褰曘€?
## 瑙勫垯鐩綍缁勭粐寤鸿

鎶€鏈爤鏂囦欢澶逛笅鍙互鍚屾椂鏀惧己瑙勫垯鍜屼笓椤硅兘鍔涙枃妗ｏ紝渚嬪 Flutter锛?
```text
rulesets/flutter/review.md                     # Flutter 鍩虹寮鸿鍒?rulesets/flutter/flutter-fix-layout-issues.md  # Flutter 甯冨眬涓撻」瑙勫垯/鑳藉姏
rulesets/flutter/performance.md                # Flutter 鎬ц兘涓撻」瑙勫垯/鑳藉姏
```

鑴氭湰涓嶄細鍖哄垎鈥滆鍒欌€濆拰鈥渟kill鈥濓紝鍙細閫掑綊璇诲彇 `rulesets/flutter/**/*.md`锛屽叏閮ㄤ綔涓鸿瘎瀹¤鑼冨彂閫佺粰妯″瀷銆?
## 璋冪敤鏂硅嚜瀹氫箟瑙勫垯

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

瀵瑰簲鐩綍锛?
```text
.ai-review/rulesets/web/review.md
.ai-review/rulesets/team/security/review.md
.ai-review/rulesets/team/security/xss.md
```

## 璇勭骇涓庢祦姘寸嚎澶辫触

妯″瀷琚姹傛寜浠ヤ笅绛夌骇杈撳嚭闂锛?
```text
P0: 闃绘柇鍙戝竷銆佷弗閲嶅畨鍏ㄩ棶棰樸€佹暟鎹涪澶便€佷弗閲嶈繍琛屾椂鏁呴殰
P1: 楂橀闄╂纭€с€佸畨鍏ㄣ€佸吋瀹规€ф垨鍙淮鎶ゆ€ч棶棰?P2: 涓闄╅棶棰?P3: 杞诲井闂鎴栧缓璁?```

褰撻厤缃細

```yaml
with:
  fail-on-findings: 'true'
```

鑴氭湰浼氭壂鎻忔姤鍛婂唴瀹癸紱鍙鍑虹幇 `P0` 鎴?`P1`锛孉ction 閫€鍑虹爜涓?1锛屾祦姘寸嚎涓嶉€氳繃銆俙P2` 鍜?`P3` 涓嶄細闃绘柇娴佹按绾裤€?
## 鏌ョ湅 CR 缁撴灉

CR 缁撴灉浼氬悓鏃跺嚭鐜板湪涓変釜鍦版柟锛?
1. GitHub Actions 鏃ュ織涓紝鎼滅储 `AI REVIEW REPORT START` 鍙互鐩存帴鏌ョ湅瀹屾暣鎶ュ憡銆?2. GitHub Actions run 鐨?Step Summary 涓紝濡傛灉褰撳墠 runner 鎻愪緵 `GITHUB_STEP_SUMMARY`銆?3. `ai-review.md` artifact 涓紝閫傚悎涓嬭浇褰掓。銆?
鍗充娇 `P0/P1` 瀵艰嚧娴佹按绾垮け璐ワ紝鎶ュ憡涔熶細鍏堟墦鍗板埌鏃ュ織鍜?Summary锛屽啀閫€鍑哄け璐ャ€?
## 杈撳叆鍙傛暟

| Input | 榛樿鍊?| 璇存槑 |
| --- | --- | --- |
| `project-types` | 绌?| 鍙€夎鐩栵紱榛樿璇诲彇 `AI_REVIEW_PROJECT_TYPES`銆?|
| `extra-rulesets` | 绌?| 鍙€夎鐩栵紱榛樿璇诲彇 `AI_REVIEW_EXTRA_RULESETS`銆?|
| `rulesets-dir` | Action 浠撳簱 `rulesets` | 瑙勫垯闆嗘牴鐩綍銆?|
| `model` | 绌?| 鍙€夎鐩栵紱榛樿璇诲彇 `AI_REVIEW_MODEL`锛屽啀浣跨敤鑴氭湰榛樿鍊笺€?|
| `base-url` | 绌?| 鍙€夎鐩栵紱榛樿璇诲彇 `AI_REVIEW_BASE_URL`锛屽啀浣跨敤鑴氭湰榛樿鍊笺€?|
| `endpoint` | 绌?| 鍙€夎鐩栵紱榛樿璇诲彇 `AI_REVIEW_ENDPOINT`锛屽惁鍒欎娇鐢?`$AI_REVIEW_BASE_URL/chat/completions`銆?|
| `api-key` | 绌?| 鍙€夎鐩栵紱榛樿璇诲彇 `AI_REVIEW_API_KEY`銆?|
| `language` | `zh-CN` | Review 杈撳嚭璇█銆?|
| `max-diff-bytes` | `200000` | 鍙戦€佺粰妯″瀷鐨勬渶澶?diff 瀛楄妭鏁般€?|
| `output` | `ai-review.md` | 浜х墿鎶ュ憡璺緞銆?|
| `fail-on-findings` | `false` | 鏄惁鍦ㄦ姤鍛婂嚭鐜?`P0` 鎴?`P1` 鏃惰 action 澶辫触銆?|
| `strict-rulesets` | `false` | 瑙勫垯闆嗙洰褰曠己澶辨椂鏄惁澶辫触銆?|
| `dry-run` | `false` | 鍙獙璇佽鍒欏拰 diff锛屼笉璋冪敤妯″瀷銆?|

## 鏈湴楠岃瘉

```bash
AI_REVIEW_DRY_RUN=true \
AI_REVIEW_PROJECT_TYPES=flutter \
AI_REVIEW_RULESETS_DIR=rulesets \
AI_REVIEW_API_KEY=dry-run-placeholder \
AI_REVIEW_DIFF='diff --git a/lib/a.dart b/lib/a.dart
+Text("hello")' \
node scripts/ai_review.js
```

## 鍚庣画鏂板椤圭洰绫诲瀷

鍙渶瑕佸鍔犱竴涓悓鍚嶈鍒欑洰褰曪紝渚嬪锛?
```text
rulesets/android/review.md
```

璋冪敤鏃堕厤缃細

```yaml
env:
  AI_REVIEW_PROJECT_TYPES: android
```
