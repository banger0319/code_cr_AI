# GitHub AI Code Review Action

杩欎釜浠撳簱鎻愪緵涓€涓彲澶嶇敤鐨?GitHub Action锛岀敤 AI 瀵硅Е鍙戦」鐩殑 Git diff 鍋?Code Review銆備笟鍔￠」鐩彧闇€瑕佸紩鐢ㄦ湰 Action锛屽苟閰嶇疆椤圭洰绫诲瀷銆佹ā鍨嬪湴鍧€鍜?API Key銆?
## 鏈€灏忔帴鍏ョず渚?
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

## 澶?diff 澶勭悊

澶?diff 澶勭悊鏄唴閮ㄥ疄鐜扮粏鑺傦紝鏈€缁堢敤鎴峰彧浼氱湅鍒版暣鐞嗗悗鐨勫畬鏁存姤鍛婏細

- 鍐呴儴鎸夋枃浠跺拰澶у皬鎷嗗垎 diff锛岄檷浣庢ā鍨嬭秴鏃舵鐜囥€?- 榛樿鏈€澶氬鐞?`20` 涓唴閮ㄥ垎鐗囷紝瓒呭嚭鏃舵渶缁堟姤鍛婃彁绀衡€滈儴鍒?diff 鏈瀹℃煡鈥濄€?- 榛樿骞跺彂璇锋眰妯″瀷锛歚3`銆?- 榛樿妯″瀷璇锋眰瓒呮椂锛歚600` 绉掋€?- 鏈€缁堟姤鍛婄粺涓€鏁寸悊涓?`Summary`銆乣Blocking Findings`銆乣Non-Blocking Findings`銆乣Notes`銆?- 浠讳竴鍐呴儴瀹℃煡缁撴灉鍑虹幇 `P0` 鎴?`P1`锛屼笖鍚敤 `fail-on-findings: 'true'`锛屾祦姘寸嚎澶辫触銆?
榛樿涓嶆帓闄や换浣曟枃浠躲€傛棤闇€ CR 鐨勬枃浠剁被鍨嬪缓璁敱琚?CR 椤圭洰鎸夎嚜韬儏鍐甸厤缃細

```yaml
with:
  exclude-paths: 'package-lock.json,pnpm-lock.yaml,yarn.lock,dist/**,build/**,coverage/**,*.map,*.png,*.jpg,*.svg'
```

濡傞渶瑕嗙洊鍐呴儴澶勭悊绛栫暐锛屼篃鍙互閰嶇疆锛?
```yaml
with:
  chunk-bytes: '60000'
  max-chunks: '20'
  concurrency: '3'
  timeout-seconds: '600'
```

## 瑙勫垯闆嗘満鍒?
- `project-types` 鏀寔閫楀彿鍒嗛殧锛屼緥濡?`flutter`銆乣web`銆乣embedded`銆乣web,embedded`銆?- `project-types: web` 浼氳鍙?`rulesets/web` 涓嬫墍鏈?`.md` 鏂囦欢锛屽寘鎷瓙鐩綍銆?- 鍔犺浇椤哄簭鏄細椤圭洰绫诲瀷瑙勫垯 鈫?`extra-rulesets`銆?- `rulesets-dir` 榛樿鎸囧悜鏈?Action 浠撳簱鐨?`rulesets`锛屼篃鍙互鏀规垚璋冪敤鏂逛粨搴撳唴鐨勮鍒欑洰褰曘€?
## 瑙勫垯鐩綍缁勭粐寤鸿

鎶€鏈爤鏂囦欢澶逛笅鍙互鍚屾椂鏀惧己瑙勫垯鍜屼笓椤硅兘鍔涙枃妗ｏ紝渚嬪 Flutter锛?
```text
rulesets/flutter/review.md
rulesets/flutter/skills/flutter-fix-layout-issues/SKILL.md
rulesets/flutter/performance.md
```

鑴氭湰涓嶄細鍖哄垎鈥滃熀纭€瑙勫垯鈥濆拰鈥滀笓椤硅兘鍔涙枃妗ｂ€濓紝鍙細閫掑綊璇诲彇 `rulesets/flutter/**/*.md`锛屽叏閮ㄤ綔涓鸿瘎瀹¤鑼冨彂閫佺粰妯″瀷銆?
## 杈撳嚭涓庨樆鏂?
CR 缁撴灉浼氬悓鏃跺嚭鐜板湪涓変釜鍦版柟锛?
1. GitHub Actions 鏃ュ織涓紝鎼滅储 `AI REVIEW REPORT START` 鍙互鐩存帴鏌ョ湅瀹屾暣鎶ュ憡銆?2. GitHub Actions run 鐨?Step Summary 涓紝濡傛灉褰撳墠 runner 鎻愪緵 `GITHUB_STEP_SUMMARY`銆?3. `ai-review.md` artifact 涓紝閫傚悎涓嬭浇褰掓。銆?
妯″瀷琚姹傛寜浠ヤ笅绛夌骇杈撳嚭闂锛?
```text
P0: 闃绘柇鍙戝竷銆佷弗閲嶅畨鍏ㄩ棶棰樸€佹暟鎹涪澶便€佷弗閲嶈繍琛屾椂鏁呴殰
P1: 楂橀闄╂纭€с€佸畨鍏ㄣ€佸吋瀹规€ф垨鍙淮鎶ゆ€ч棶棰?P2: 涓闄╅棶棰?P3: 杞诲井闂鎴栧缓璁?```

褰撻厤缃?`fail-on-findings: 'true'` 鏃讹紝鏈€缁堟姤鍛婁腑鍙鍑虹幇 `P0` 鎴?`P1`锛孉ction 閫€鍑虹爜涓?1锛屾祦姘寸嚎涓嶉€氳繃銆?
## 杈撳叆鍙傛暟

| Input | 榛樿鍊?| 璇存槑 |
| --- | --- | --- |
| `project-types` | 绌?| 椤圭洰绫诲瀷瑙勫垯鐩綍锛岄€楀彿鍒嗛殧銆?|
| `extra-rulesets` | 绌?| 棰濆瑙勫垯鐩綍锛岄€楀彿鍒嗛殧銆?|
| `rulesets-dir` | Action 浠撳簱 `rulesets` | 瑙勫垯闆嗘牴鐩綍銆?|
| `model` | 绌?| 鍙€夎鐩栵紱榛樿璇诲彇 `AI_REVIEW_MODEL`锛屽啀浣跨敤鑴氭湰榛樿鍊笺€?|
| `base-url` | 绌?| 鍙€夎鐩栵紱榛樿璇诲彇 `AI_REVIEW_BASE_URL`锛屽啀浣跨敤鑴氭湰榛樿鍊笺€?|
| `endpoint` | 绌?| 鍙€夎鐩栵紱榛樿璇诲彇 `AI_REVIEW_ENDPOINT`锛屽惁鍒欎娇鐢?`$AI_REVIEW_BASE_URL/chat/completions`銆?|
| `api-key` | 绌?| 鍙€夎鐩栵紱榛樿璇诲彇 `AI_REVIEW_API_KEY`銆?|
| `language` | `zh-CN` | Review 杈撳嚭璇█銆?|
| `chunk-bytes` | `60000` | 鍐呴儴鍗曟妯″瀷瀹℃煡鐨勬渶澶?diff 瀛楄妭鏁般€?|
| `max-chunks` | `20` | 鏈€澶氬鐞嗙殑鍐呴儴 diff 鍒嗙墖鏁般€?|
| `concurrency` | `3` | 骞跺彂妯″瀷璇锋眰鏁般€?|
| `timeout-seconds` | `600` | 鍗曟妯″瀷璇锋眰瓒呮椂鏃堕棿銆?|
| `exclude-paths` | 绌?| 閫楀彿鍒嗛殧鐨勮繃婊?glob锛岀敱琚?CR 椤圭洰鎸夐渶閰嶇疆銆?|
| `output` | `ai-review.md` | 浜х墿鎶ュ憡璺緞銆?|
| `fail-on-findings` | `false` | 鏄惁鍦ㄦ姤鍛婂嚭鐜?`P0` 鎴?`P1` 鏃惰 action 澶辫触銆?|
| `strict-rulesets` | `false` | 瑙勫垯闆嗙洰褰曠己澶辨椂鏄惁澶辫触銆?|
| `dry-run` | `false` | 鍙獙璇佽鍒欍€乨iff 鍒嗙墖鍜岃繃婊わ紝涓嶈皟鐢ㄦā鍨嬨€?|
