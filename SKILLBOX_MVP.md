# SkillBox MVP（可插拔 Skills + 多智能体协作）设计说明

> 目标：做一个“Box”，把 skill 做成可插拔插件，并让多智能体在同一工程中协作开发/运行 skill，且**输入-过程-产物全可追溯、可检索**。

## 1. 问题（Why）

### 1.1 当前常见痛点
- **技能难复用**：skill 往往强依赖项目目录结构/依赖环境/入口方式，迁移成本高。
- **迭代不可追溯**：一次运行的输入参数、关键步骤、输出产物分散在各处，难以复盘与对比。
- **多智能体协作易冲突**：多个 agent 并行改代码/跑任务，容易覆盖文件、混淆产物来源。
- **依赖管理混乱**：Playwright/浏览器二进制下载不稳定；不同 skill 依赖冲突难处理。

### 1.2 你要解决的核心
- 把 skills 做成真正的“插件包”：**安装/卸载/版本切换/发现/校验/运行**。
- 做一个面向 AI 的文件系统与日志体系：**按 run/agent 组织 + JSONL 事件/记忆 + 产物索引**。

## 2. 难点（Hard Parts）

- **插件发现与冲突**：同名 skill 多版本共存、默认版本选择、路径优先级。
- **可追溯与可检索**：日志要结构化（事件/记忆/产物索引），并能跨 run 查询。
- **多智能体并发写入**：无锁情况下如何避免共享写冲突（MVP 用“隔离写 + 协调者写 shared”规避）。
- **依赖策略**：共享 venv 简单但可能冲突；每 skill 独立 venv 可靠但复杂（MVP 先 shared）。
- **浏览器策略**：Playwright 自带浏览器下载易失败（MVP 默认用系统浏览器 channel/executablePath）。

## 3. 设计目标与原则（Design Goals）

- **可插拔**：skill 只要符合规范（manifest + entrypoint），就能被安装并运行。
- **稳定接口**：skill 与平台通过 `ctx` 解耦；平台能力通过 ctx 注入，skill 不直接管底层。
- **默认可追溯**：每次运行自动落盘 request/config/result/events/memory/index。
- **多 agent 友好**：默认隔离写入（agent 私有目录），共享目录仅协调者写（无锁阶段）。
- **渐进式**：先 MVP（能用、能迭代），再逐步补版本/隔离/安全/锁/GUI。

## 4. MVP 范围（What’s In / Out）

### 4.1 MVP 必做（本仓库已具备/正在具备）
- Skill 运行契约：`skills/<skill>/main.py:run(ctx)`
- Skill manifest：`skills/<skill>/skill.json`
- Skill 发现/校验：
  - `python run.py --list`
  - `python run.py --validate --skill <name>`
- CLI 覆盖配置（不改文件）：
  - `python run.py --skill <name> ... --set key=value --set key2=value2`
- 运行可追溯落盘：
  - `request.json`（本次输入快照）
  - `events.jsonl`（结构化事件）
  - `memory.jsonl`（结构化“决策/事实”）
  - `index.jsonl`（产物索引）
  - `result.json`（最终结果）
- 多智能体目录布局：同一 `run_id` 下按 `agent_id` 隔离。
- 系统浏览器优先：`channel=msedge/chrome` 或 `executablePath=...`。

### 4.2 MVP 明确不做（后续迭代）
- 共享目录并发锁（file lock / atomic merge）
- 每 skill 独立 venv（依赖隔离执行）
- 远程 skill 安装（git/url）与签名校验
- Web 控制台/GUI

## 5. 总体设计（Architecture）

### 5.1 核心模块
- `runtime/engine.py`
  - 负责：run_id/agent_id、目录创建、日志/事件/记忆/产物记录、加载 skill 并调用 `run(ctx)`
- `runtime/registry.py`
  - 负责：扫描 `skills/**/skill.json`，实现 discover/resolve/validate
  - 预留：`SKILLBOX_SKILL_PATHS` 多根路径（未来 Skill Store）
- `runtime/common/*`
  - `events.py`：JSONL 事件
  - `memory.py`：JSONL 记忆
  - `artifacts.py`：产物写入 + index.jsonl
  - `runmeta.py`：agent.json / shared/run.json 元信息

### 5.2 技能包结构（Runtime Skill）
```
skills/<skill_name>/
  skill.json          # manifest（发现/版本/入口/能力）
  main.py             # run(ctx)
  config.yaml         # 默认配置（可选）
  resources/          # 静态资源（可选）
    shared/
    private/
  common/             # skill 私有共享代码（可选）
```

### 5.3 多智能体运行目录（Run Layout）
```
outputs/<skill>/<run_id>/
  shared/                 # 无锁阶段：仅 coordinator 写
    run.json              # run 元信息（可选）
  agents/<agent_id>/      # 每个 agent 私有空间（默认写这里）
    agent.json            # agent 元信息 + 生效 config
    work/
      request.json        # 本次输入快照（argv + overrides + merged config）
    events.jsonl          # 结构化事件（可检索）
    memory.jsonl          # 结构化记忆（可检索）
    index.jsonl           # 产物索引（可检索）
    result.json           # 结果
```

## 6. 优点（Pros）

- **真插拔的基础打牢**：manifest + discover + validate + 多根路径预留。
- **跑一次就沉淀一次**：request/result/events/memory/index 默认生成，天然支持回放与迭代。
- **多 agent 可控**：隔离写入让“无锁协作”也能稳定推进。
- **依赖策略务实**：优先系统浏览器，避开 Playwright 下载不稳定的最常见坑。
- **可渐进演进**：后续加 skill store、版本激活、依赖隔离、锁，都是在现有接口上扩展。

## 7. 功能实现（How）

### 7.1 Skill 发现与校验
- 每个 skill 提供 `skill.json`（name/version/entry/capabilities）
- `runtime/registry.py` 扫描 `skills/*/skill.json`
- `--validate` 会尝试 import `skills.<name>.<module>` 并检查入口函数是否可调用

### 7.2 运行时配置覆盖（不改文件）
- `run.py --set key=value`（可重复）
- 引擎合并：`config.yaml`（默认） + CLI overrides（浅合并）
- 合并后的“生效配置”落盘到：
  - `outputs/.../agents/<agent>/agent.json`
  - `outputs/.../agents/<agent>/work/request.json`

### 7.3 可追溯日志与产物
- `ctx.events.emit(...)`：写 `events.jsonl`
- `ctx.memory.append(...)`：写 `memory.jsonl`
- `ctx.artifacts.write_*`：写文件并记录到 `index.jsonl`

### 7.4 TS/Node Playwright 集成（示例路径）
- TS 工程：`integrations/rpaskill_ts/`
- 稳定 runner：`integrations/rpaskill_ts/cli/run.mjs`
- Python bridge：`skills/rpa_ts_skill/common/runner.py`
- wrapper skills：
  - `skills/web_search_skill/` -> TS `webSearch`
  - `skills/adaptive_search_skill/` -> TS `adaptiveSearch`

## 8. 功能方法（How To Use / MVP 操作手册）

### 8.1 列出/校验 skills
```powershell
python run.py --root . --list
python run.py --root . --validate --skill web_search_skill
```

### 8.2 运行 skill（可追溯 + 不改文件）
```powershell
python run.py --skill web_search_skill --root . --run-id demo --agent agent0 `
  --set query="..." --set engine="bing" --set pages=2 --set details=0 --set channel="msedge"
```

### 8.3 查询历史 runs 与事件
```powershell
python tools/list_runs.py --root .
python tools/query_events.py --root . --skill web_search_skill --run-id demo --agent agent0 --limit 50
```

## 9. 技术选型（Tech）

- 运行时语言：Python（平台/引擎/记录系统）
- 自动化：Playwright
  - MVP 策略：优先 `channel=msedge/chrome` 或 `executablePath` 使用系统浏览器
- TS 集成：Node.js（用于复用现成 Playwright/搜索模块）
- 配置：YAML（skill 默认配置）+ CLI overrides（JSON 解析）
- 记录与检索：JSONL（events/memory/index）

## 10. 下一步（Post-MVP Roadmap）

1) Skill Store（Box）+ 导入/安装：`tools/skillctl.py`
   - install/uninstall/list/activate/doctor
2) 多根 skill 路径 + 版本激活策略（active_version）
3) 依赖隔离：venv-per-skill + 子进程执行模式
4) 并发锁：shared/ 写入锁 + 原子写 + shared index 合并
5) 可视化：run 列表、事件检索、产物浏览、运行对比

