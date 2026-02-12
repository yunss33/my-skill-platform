# adaptive_search_skill

多轮浏览器搜索（TypeScript/Playwright `adaptiveSearch`）的 Python 封装 skill。特点：
- 不只“搜”：支持按 `details > 0` **点开部分结果页**做验证/补漏
- 可复盘：输出 `rpa_trace.jsonl` + 搜索/打开页截图，便于 AI 基于图片/HTML做分析
- 可复用登录态：默认使用 Playwright persistent profile（按 `profileSite/profileAccount` 分目录）

## 快速开始

在仓库根目录 `my-skill-platform/`：

```powershell
python run.py --skill adaptive_search_skill --root . --run-id demo --agent agent0 `
  --set query="你的问题" --set engine="bing" --set pages=2 --set maxRounds=2 `
  --set details=2 --set headless=false --set channel="msedge"
```

建议：为了提高召回，不要把搜索当数据库。把 `details` 设为 `2-5`，让技能在每轮里适度点开结果页。

## 关键配置（常用）

必须：
- `query`: 搜索问题/关键词

搜索与迭代：
- `engine`: `bing | baidu | ...`（由 TS 层支持的引擎决定）
- `pages`: SERP 翻页数
- `perPage`: 每页结果数
- `minResults`: 每轮最少结果阈值
- `maxRounds`: 最大迭代轮数
- `goal`: `auto | popular | academic | shopping | technical`
- `language`: `auto | zh | en | ...`

点开验证（核心）：
- `details`: 打开详情页数量（`0` 表示只看 SERP；`>0` 会点开结果页）

浏览器：
- `headless`: 是否无头
- `channel`: `msedge | chromium | chrome`（取决于本机/Playwright）

审计日志（TS 层）：
- `logEnabled`: 是否开启
- `logFormat`: `jsonl`

登录态/会话复用（Python wrapper 自动处理）：
- `profileSite` / `profileAccount`: 用于生成稳定的 `userDataDir` 路径（默认 `adaptive_search/default`）
- `userDataDir`: 也可直接指定（不建议频繁变动，否则登录态不稳定）

截图与追踪（Python wrapper 默认会设置到 outputs 下，可按需覆盖）：
- `screenshotPrefix`: SERP 截图前缀（默认：`outputs/.../screenshots/search`）
- `openScreenshotPrefix`: 打开页截图前缀（默认：`outputs/.../screenshots/open`）
- `openScreenshotFullPage`: 打开页是否全页截图（默认：`true`）
- `tracePath`: 追踪日志（默认：`outputs/.../rpa_trace.jsonl`）

## 产物（outputs）

每次运行会在：
- `outputs/adaptive_search_skill/<run_id>/agents/<agent_id>/rpa_trace.jsonl`
- `outputs/adaptive_search_skill/<run_id>/agents/<agent_id>/screenshots/`

并且 `main.py` 会从 trace 中汇总 `screenshotPath`，作为 `run()` 返回值里的 `screenshots` 列表，方便上层把截图交给 AI 分析。

## 需要“看页面内容/结构”时：inspectPage

当 SERP/摘要不够、需要 AI 基于“截图 + HTML”判断页面是否真的有内容时，可用：

```powershell
python run.py --skill rpa_ts_skill --root . --run-id inspect_demo --agent agent0 `
  --set action=inspectPage --set url="https://example.com" --set channel="msedge" --set headless=true
```

它会生成：
- `*_screenshot.png`
- `*_page.html`
- `*_a11y.aria.yml`
- `*_elements.json`

