# my-skill-platform (SkillBox)

一个“可插拔 Skills + 可追溯运行（run/agent/events/memory/artifacts）”的平台原型仓库。
核心目标：让 AI/人都能复盘一次任务是怎么做出来的（输入参数、关键步骤、截图/HTML 等证据、最终结果）。

相关文档：
- 平台/Skill 运行契约：`SKILL.md`
- 设计说明（MVP）：`SKILLBOX_MVP.md`

## 你能用它做什么

- 把技能做成插件：每个 skill 一个目录（`skills/<name>/`），带 `skill.json` + `main.py:run(ctx)`
- CLI 覆盖配置（不改文件）：`python run.py --skill ... --set key=value`
- 浏览器自动化/RPA（Playwright）：支持搜索、点开结果页、保存截图/HTML/UI map、写 trace
- 人机协作：遇到登录/验证码/风控，可用 session 模式把浏览器保持打开，让人处理后继续

## 快速开始

在仓库根目录执行：

```powershell
# 1) 初始化 Python 依赖（建议先跳过浏览器下载，优先使用系统浏览器 channel=msedge/chrome）
python setup_platform.py --skip-browsers

# 可选：同时安装 TS 集成依赖（需要 Node/npm）
python setup_platform.py --skip-browsers --with-node

# 2) 查看可用 skills
python run.py --root . --list
```

## 常用示例

### 1) 多轮“可复盘”的浏览器搜索（推荐）

```powershell
python run.py --skill adaptive_search_skill --root . --run-id demo --agent agent0 `
  --set query="充电宝 推荐 2026" --set engine="bing" --set pages=2 --set maxRounds=2 `
  --set details=3 --set headless=false --set channel=msedge
```

要点：
- `details > 0` 会“适度点开”部分结果页，提高召回并减少只看 SERP 导致的漏信息
- 默认会把截图和 `rpa_trace.jsonl` 落到 `outputs/**`，便于后续 AI 基于图片/HTML做判断

### 2) 只跑一次网页搜索

```powershell
python run.py --skill web_search_skill --root . --run-id demo --agent agent0 `
  --set query="site:github.com Playwright persistent context userDataDir" --set engine="bing" `
  --set pages=2 --set details=2
```

### 3) 抓取“页面证据”（截图 + HTML + UI map）

当你需要让 AI“看见页面到底长什么样/有没有被重定向/是不是验证码页”：

```powershell
python run.py --skill rpa_ts_skill --root . --run-id inspect_demo --agent agent0 `
  --set action=inspectPage --set url="https://www.goofish.com/" --set headless=false --set channel=msedge
```

输出（示例路径）：
`outputs/rpa_ts_skill/<run_id>/agents/<agent>/captures/*_screenshot.png|*_page.html|*_elements.json|*_a11y.aria.yml`

## 输出目录（可追溯）

每次运行都会落盘到：

```
outputs/<skill>/<run_id>/
  shared/
  agents/<agent_id>/
    work/request.json
    events.jsonl
    memory.jsonl
    index.jsonl
    result.json
```

## 重要说明

- 本仓库的“人机协作”能力用于 **等待** 你手动完成登录/验证码/风控步骤；不包含、也不建议任何绕过机制。
- 建议优先使用系统浏览器（`channel=msedge|chrome`），可显著降低 Playwright 浏览器下载不稳定带来的环境问题。

