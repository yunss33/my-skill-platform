﻿---
name: rpa-web-automation
description: Automate web pages using Playwright in this repo. Use when Codex needs to build or extend RPA scripts, examples, or core utilities that launch browsers, navigate, interact with elements, extract data, or orchestrate flows.
---

# RPA Web Automation (Playwright) - Codex Multi-Agent Skill

这是一份给 **Codex/多 AI 协作开发** 用的 `SKILL.md`（指导“怎么在这个 repo 里工作”），不是运行时的业务 skill（不是 `skills/*` 那种）。

目标：
- 让多个 AI 在同一个工程里改 Playwright/RPA 相关代码时，**不互相踩文件**、**能共享记忆**、**产物可追溯可检索**。
- 实现**人机协作**，在遇到登录、验证码等自动化困难的场景时，能够请求人工干预。

## 渐进式工作流（Progressive）

只做必要步骤，逐层加复杂度：

### Level 0：先定位，不写大改
1) 明确需求：目标网站/流程、输出结果、是否登录、是否允许真实浏览器运行。
2) 选“落点”（在哪改）：
   - TS 自动化能力（Playwright 封装/流程能力）：`integrations/rpaskill_ts/`
   - Python 平台 skill（编排/对接/输出规范）：`skills/<skill>/` + `runtime/`
3) 只做最小验证：能 import、能跑 smoke；不要一上来就跑真实网站。

### Level 1：做最小可用改动（MVP）
- 能复用已有 runner/封装；新逻辑先落在最少文件里；
- 保留兼容：不要破坏旧 API/旧配置。

### Level 2：补齐可维护性
- 抽公共模块、补配置/示例、补测试（至少 import/smoke）。

## 代码落点（Repo 约定）

### TS 集成（从 RPASkill 迁来的 TypeScript 项目）
- `integrations/rpaskill_ts/src/`：核心实现（浏览器/导航/元素/提取/流程）
- `integrations/rpaskill_ts/src/skills/`：搜索类模块（`webSearch`、`adaptiveSearch` 等）
- `integrations/rpaskill_ts/cli/run.mjs`：稳定 CLI runner（给 Python 平台调用）

### Python 平台（让“多 AI + 多 skill”跑得规范）
- `runtime/`：engine/logger/config + outputs 规范 + events/memory/artifacts
- `skills/`：平台一等公民 skills（也可以做 TS 的薄封装 skill）

## 依赖与 Playwright 浏览器（公共依赖）

### Python（平台公共依赖）
建议用平台的共享 venv（避免每个 skill 各装各的）：
- `python setup_platform.py --skip-browsers`

浏览器二进制默认规划在：
- `runtime/deps/playwright_browsers/`
- 由 `runtime/engine.py` 统一设置 `PLAYWRIGHT_BROWSERS_PATH`

如果网络环境导致下载浏览器失败：
- 优先用系统浏览器 `channel=msedge` / `channel=chrome`（最稳定）

### Node（TS 集成依赖）
在 `integrations/rpaskill_ts/`：
- `npm install`

## 多 AI 协作：共享记忆 + 私有工作区（当前不做锁）

关键原则：**默认只写自己的 agent 目录**，共享目录只让一个“协调者 agent”写。

运行时目录（每个 run）：
```
outputs/<skill>/<run_id>/
  shared/
  agents/<agent_id>/
    work/
    events.jsonl
    memory.jsonl
    index.jsonl
    result.json
```

建议写法：
- 私有工作区：`outputs/.../agents/<agent_id>/work/`（临时文件/中间结果/草稿）
- 共享记忆（无锁时）：只由协调者写 `shared/memory.jsonl`、`shared/events.jsonl`
- AI 友好检索：
  - `events.jsonl`：结构化事件（event/level/data/paths）
  - `memory.jsonl`：短“事实/决策”（大内容写 artifact 文件，再在 memory 里引用路径）
  - `index.jsonl`：产物索引（路径/hash/大小）

## 人机协作实现（关键）

### 核心场景
- **登录验证**：需要输入用户名密码、短信验证码、图形验证码
- **人机验证**：需要滑动验证码、点击验证码、文字识别验证码
- **复杂交互**：需要人工判断和决策的复杂操作

### 实现方式

#### 1. 信号机制
```typescript
// TS 端实现
async function checkForHumanInterventionNeeded(page): Promise<boolean> {
  // 检查是否出现登录页、验证码等需要人工干预的场景
  const hasLoginForm = await page.locator('#login-form').isVisible().catch(() => false);
  const hasCaptcha = await page.locator('.captcha').isVisible().catch(() => false);
  return hasLoginForm || hasCaptcha;
}

async function requestHumanIntervention(page, taskDescription): Promise<boolean> {
  console.log(`[HUMAN INTERVENTION NEEDED] ${taskDescription}`);
  console.log('Please complete the task in the browser window.');
  console.log('Press Enter when done...');
  
  // 等待用户输入
  await new Promise(resolve => {
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve(true);
    });
  });
  
  return true;
}
```

#### 2. Python 端集成
```python
# Python 端实现
def run_with_human_intervention(ctx, rpa_task):
    """运行 RPA 任务，遇到需要人工干预的场景时暂停等待"""
    try:
        result = rpa_task()
        return result
    except HumanInterventionRequired as e:
        print(f"[需要人工干预] {e.message}")
        print("请在浏览器中完成操作，完成后按 Enter 继续...")
        input()
        # 继续执行任务
        return rpa_task()
```

### 处理流程

1. **检测阶段**：在关键操作前检查是否需要人工干预
2. **请求阶段**：当检测到需要人工干预时，暂停自动化并请求用户操作
3. **验证阶段**：用户完成操作后，验证操作是否成功
4. **恢复阶段**：操作成功后，恢复自动化流程

### 代码建议

- **模块化设计**：将人工干预检测和处理逻辑封装为独立模块
- **配置化**：通过配置文件或环境变量控制是否启用人工干预
- **日志记录**：详细记录人工干预的场景和结果
- **异常处理**：为人工干预场景定义专门的异常类型

### 最佳实践

1. **提前检测**：在进入可能需要登录的页面前，先检查登录状态
2. **清晰提示**：向用户提供明确的操作指示和预期结果
3. **超时处理**：为人工干预设置合理的超时时间
4. **状态保存**：在人工干预前后保存页面状态，便于恢复
5. **测试覆盖**：为人工干预场景编写专门的测试用例

## Playwright/RPA 编码规范（通用）

- 等待优先：`waitForLoadState` / element visible，再 click/type
- 少用 `sleep`：用 retry + timeout 提升稳定性
- 把可复用能力放在：
  - TS：`integrations/rpaskill_ts/src/core/`
  - Python：`runtime/rpa/` 或 `runtime/common/`
- 可运行 demo/流程放在：
  - TS：`integrations/rpaskill_ts/examples/`
  - Python：`skills/<skill>/`

## 相关 Codex Skills

- 搜索增强/多轮查询：`codex-skills/search-enhancer/SKILL.md`

