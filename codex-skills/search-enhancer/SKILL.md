---
name: search-enhancer
description: Enhance search quality and question formulation. Use when users ask for stronger search, multi-round query planning, clarification questions, adaptiveSearch execution, click-through (open results) verification, screenshot/HTML-based analysis, or audit logging of search decisions in this repo.
---

# Search Enhancer - Codex Multi-Agent Skill

这是一份给 **Codex/多 AI 协作** 用的“渐进式 AIskill”说明（指导怎么把“模糊问题 -> 可执行的搜索 -> 可追溯的证据链输出”）。
它不是运行时业务 skill（不是 `skills/*` 那种）。

## 渐进式工作流（Progressive）

### Level 0：只做“把问题问清楚”
目标：用最少问题把需求变成可搜索、可验证的任务。

只问 1-2 个关键澄清问题（避免 10 连问）：
- 目标：科普/技术实现/学术/购物对比/最新动态？
- 时间范围：要“最新（近 3-6 个月）”还是“原理类不需要最新”？
- 输出形式：要结论摘要，还是要带引用/链接证据？

### Level 1：给出查询计划（不跑浏览器也行）
产出：
- 选择 goal：`auto | popular | academic | shopping | technical` + 理由
- 2-3 个查询串（中文/英文/同义词）
- 可信来源优先级（docs/papers/官方/百科/论坛等）

### Level 2：执行多轮搜索 + 结构化审计日志
目标：能复盘“为什么这么搜、哪一轮最好、证据来自哪里”。

优先用本 repo 的 TS 集成 `adaptiveSearch`（带 audit logs），并把日志落到可检索的位置。

#### 关键增强：不要把搜索当数据库（要“适度点开验证”）
很多 SERP（搜索结果页）标题/摘要不完整，甚至标题缺失或很“正常/泛”，但点进详情页才有关键内容。
因此：**拿到搜索结果后，要用有限预算“点开一部分结果”做验证与补漏**，再决定结论与证据。

点击/打开的原则（Click-through budget）：
- 每轮至少打开 `2` 个结果（必要时提高到 `3-5`），并**包含 1 个“不确定但可能有料”的结果**（避免只点“看起来最像答案”的）。
- 标题缺失/很泛（如“首页/详情/正文”）时，改用 `域名 + URL 路径 + 摘要片段` 决策是否点开。
- 追求“证据面”而非“命中率”：优先覆盖不同来源类型（官方文档/论文/新闻/论坛/代码仓库）。

在本 repo 里怎么做（可直接复制）：
1) 用平台 skill 跑 `adaptive_search_skill`，开启详情页打开：
   - `--set details=2`（或更高）
   - 建议同时开启截图：`--set openScreenshotPrefix="...\\screenshots\\open"`（便于后续 AI/人复盘）
2) 对少量关键链接做“截图 + HTML”取证（当需要看页面结构/内容而不是只看摘要）：
   - 用 `rpa_ts_skill` 的 `action=inspectPage` 获取 `*_screenshot.png` + `*_page.html` + `*_a11y.aria.yml` + `*_elements.json`
   - 让 AI 基于截图与 HTML 做内容判断（例如：是否有关键段落/表格、是否被重定向、是否是广告页/聚合页）

## 本 repo 中的代码落点（Where）

搜索能力来自迁移进来的 TypeScript 集成：
- `integrations/rpaskill_ts/src/skills/adaptiveSearch.ts`
- `integrations/rpaskill_ts/src/skills/webSearch.ts`
- runner：`integrations/rpaskill_ts/cli/run.mjs`

平台提供的“一等公民 skill 封装”（Python）：
- `skills/adaptive_search_skill/`（封装 TS `adaptiveSearch`）
- `skills/web_search_skill/`（封装 TS `webSearch`）
- 公共 runner bridge：`skills/rpa_ts_skill/common/runner.py`

## 多 AI 协作协议（No Locks Yet）

没有锁时，核心原则：**默认只写 agent 私有目录**，共享目录只让“协调者 agent”写。

约定：
- 协调者（coordinator）：负责最终 query plan、最终输出、共享记忆写入
- 执行者（worker）：负责跑某一轮搜索/开链接摘要/整理候选证据（写私有目录）

运行时目录（由平台生成）：
```
outputs/<skill>/<run_id>/
  shared/
  agents/<agent_id>/
    work/
    events.jsonl
    memory.jsonl
    index.jsonl
```

记录要求（AI 友好检索）：
- `events.jsonl`：每轮搜索、决策点、结果摘要（可过滤 event/round）
- `memory.jsonl`：只写短“事实/决策”，大内容写 artifact 文件再引用路径
- `index.jsonl`：产物索引（路径/hash/大小）

## 执行方式（How）

### 方式 A：走平台 skill（推荐，日志/产物统一）
```
python run.py --skill adaptive_search_skill --root . --run-id demo --agent agent0
python run.py --skill web_search_skill --root . --run-id demo --agent agent1
```

### 方式 B：直接跑 TS runner（适合调试 TS 层）
在 `integrations/rpaskill_ts/`：
- `npm install`
- `node cli/run.mjs --action adaptiveSearch --input <config.json> --output <out.json>`

## 输出标准（What To Output）

无论用哪种方式，最终输出应包含：
- goal（选了什么 + 为什么）
- 最佳轮次（best round）摘要
- 3-5 条最关键证据（标题+来源域名+链接），**优先来自“点开后的详情页”而非仅 SERP**
- 复盘信息：搜索关键词/过滤条件/迭代原因（来自 events/memory）
