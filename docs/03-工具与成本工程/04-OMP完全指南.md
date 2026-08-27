# OMP 完全指南

本文是 OMP 的完整使用指南。《AI Coding Agent 实战操作手册》第 3 章是本文的摘要，侧重安装验收与决策速查；本文展开完整操作细节。

## 一、安装与第一次运行

OMP 是主工作入口，整合了：

- 多模型与角色路由；
- 项目上下文和 `AGENTS.md` 自动发现；
- 会话恢复、分支、派生、压缩与交接；
- 计划、目标、循环和后台模式；
- 子 Agent、Skill、插件、MCP 与调试工具；
- 交互式 TUI、单轮 Print、JSON、RPC 和 ACP 接入模式。

### 安装

任选一种方式，不要重复安装。

**方式 A：已经安装 Bun**

```sh
bun install -g @oh-my-pi/pi-coding-agent
```

**方式 B：自动选择 Bun 或预编译二进制**

```sh
curl -fsSL https://raw.githubusercontent.com/can1357/oh-my-pi/main/scripts/install.sh | sh
```

### 安装验收

```sh
omp --version
omp config path
omp -p 'hello'
```

三项分别证明：二进制可执行、配置目录可解析、模型调用链可工作。任何一项失败都先修复，不继续叠加插件。

### 配置认证

API Key 方式适合按量计费的模型提供商：

```sh
export ANTHROPIC_API_KEY=sk-ant-...
# 也可使用 OPENAI_API_KEY、GEMINI_API_KEY、OPENROUTER_API_KEY 等
omp
```

需要订阅账号 OAuth 时，在 OMP 中执行 `/login`：`/login` 追加凭据，`/logout` 撤销凭据。凭据数据库位于 `~/.omp/agent/agent.db`；迁移机器时同时迁移或重新建立凭据，不能只复制 `config.yml`。

### 终端设置与第一次运行

OMP 使用 Kitty 键盘协议区分 Enter、Shift + Enter 和 Alt 组合键。以 `/hotkeys` 显示的实际映射为准。不要死记第三方教程里的快捷键。升级 OMP 或更换终端后，先运行 `/hotkeys`。

进入项目根目录后启动：

```sh
omp
```

OMP 会把当前目录当作项目根目录，并自动发现其中的 `AGENTS.md`、技能和其他上下文文件。先用一个小任务验证文件读取、模型响应和工具调用：

```text
概括 src/main.ts 的职责，只读，不修改文件。输出：职责、入口、主要依赖。
```

## 二、先理解 TUI，再记命令

交互界面可以拆成四块：

1. Header：会话标题、当前分支和已启用模式；
2. Messages：用户消息、助手回复和工具调用卡片；
3. Editor：提示词、文件引用、图片、shell 与外部编辑器入口；
4. Footer：工作目录、Git 分支、Token、费用、上下文占用和模型。

### 编辑器最常用的能力

| 能力 | 默认操作 | 说明 |
| --- | --- | --- |
| 引用文件 | `@` | 模糊搜索未被 `.gitignore` 忽略的文件，并把内容放入提示词 |
| 路径补全 | `Tab` | 补全相对路径、`../`、`~/` 等 |
| 多行输入 | `Shift + Enter` 或终端支持的替代键 | 具体映射以 `/hotkeys` 为准 |
| 附加图片 | 粘贴、拖放或 `@image.png` | 需要模型支持图片输入 |
| Shell 转义 | `!` | 运行命令，并把输出送入上下文 |
| 隐藏 Shell 输出 | `!!` | 运行并显示命令，但不把输出送入模型上下文 |
| Python 转义 | `$` / `$$` | 在共享 Python 内核中运行；双 `$` 隐藏输出 |
| 外部编辑器 | `Ctrl + G` | 用 `$VISUAL` 或 `$EDITOR` 编辑当前草稿 |
| 展开工具结果 | `Ctrl + O` | 查看完整输出、diff 或命令记录 |

`!!` 和 `$$` 的价值很直接：有些命令只需要人看，不需要模型看。避免把无关输出塞进上下文，就是最便宜的 Token 优化。

### 运行中的消息队列

Agent 工作时继续输入，消息不会丢失。稳定的心智模型只有两类：

- Steering：当前轮次完成工具调用后尽快送达，用于纠偏；
- Follow-up：当前队列全部结束后送达，用于“完成后再做下一件事”。

不同终端与版本的默认组合键可能不同；在当前会话运行 `/hotkeys` 查看权威映射。队列行为由以下配置控制：

```yaml
steeringMode: one-at-a-time   # 或 all
followUpMode: one-at-a-time   # 或 all
interruptMode: immediate      # 或 wait
```

如果频繁通过 Steering 改需求，真正的问题通常是首条指令不完整。中途纠偏适合处理新证据，不适合代替任务说明。

## 三、配置模型角色，而不是每轮手选模型

持久化配置默认位于 `~/.omp/agent/config.yml`。三种编辑方式：

- TUI 中运行 `/settings`；
- shell 中运行 `omp config <action>`；
- 直接编辑 YAML，再用 `omp config list` 校验。

常用命令：

```sh
omp config list
omp config get modelRoles.default
omp config set theme.dark catppuccin-macchiato
omp config reset theme.dark
omp config path
```

配置优先级从高到低是：CLI 参数、环境变量、`config.yml`、内置默认值。

### 用角色做模型路由

模型名称会变，角色相对稳定：

```yaml
modelRoles:
  default: anthropic/claude-sonnet-4-5
  smol: anthropic/claude-haiku-4-5
  slow: anthropic/claude-opus-4-6:high
  plan: openai/gpt-5.3-codex:high
  commit: anthropic/claude-haiku-4-5
```

这份配置表达的并非“哪个模型最好”，而是成本分配：

| 角色 | 任务 |
| --- | --- |
| `default` | 常规实现、代码问答 |
| `smol` | 分类、机械修改、短摘要 |
| `slow` | 复杂故障、架构权衡、高风险 Review |
| `plan` | 多文件任务的只读规划 |
| `commit` | 提交信息等短而稳定的输出 |

用 `omp --list-models` 查当前提供商实际可用的模型 ID。配置文件中的旧模型名失效时，应更新映射，不要把具体模型名称散落在每一份提示词和项目文档里。

> 手工写坏 `config.yml` 可能阻止程序启动。修改后运行 `omp config list`；schema 校验失败时先修配置，不要继续叠加改动。

## 四、会话不是一条聊天记录，而是一棵树

OMP 会话以 JSONL 形式保存在 `~/.omp/agent/sessions/`，按工作目录隔离。每一轮都带父指针，因此一次会话天然可以分支。

### 恢复与新建

```sh
omp -c                       # 继续当前目录最近的会话
omp -r                       # 打开当前项目的会话选择器
omp -r 1f9d2a                # 按 ID 前缀恢复
omp --resume ./session.jsonl # 恢复指定文件
omp --no-session             # 临时会话，不写入磁盘
```

### 会话操作决策表

| 需求 | 操作 | 说明 |
| --- | --- | --- |
| 开始无关的新任务 | `/new` | 新目标不继承旧任务历史 |
| 删除当前会话并重建 | `/drop` | 当前会话确定不再保留 |
| 继续当前项目最近会话 | `omp -c` | 重新接入最近任务 |
| 选择历史会话 | `omp -r` | 查看当前项目会话列表 |
| 会话内切换历史会话 | `/resume` | 不退出 TUI 打开会话选择器 |
| 临时、不落盘的任务 | `omp --no-session` | 不需要恢复或审计 |
| 同一任务历史太长 | `/compact [focus]` | 当前会话内压缩旧历史 |
| 阶段结束，下一阶段需干净上下文 | `/handoff [focus]` | 创建带结构化交接的新会话 |
| 同一问题内探索分支 | `/branch` | 仍保存在同一会话文件 |
| 方案可能整体放弃 | `/fork` | 克隆成新的会话文件 |
| 重命名会话 | `/rename <title>` | 设置容易识别的名称 |
| 重新绑定工作目录 | `/move <path>` | 把会话移到另一个工作目录 |
| 查看会话元信息 | `/session info` | ID、路径、谱系和统计 |
| 查看上下文占用 | `/context` | 判断下一轮是否装得下 |
| 查看额度和速率限制 | `/usage` | 区分额度问题与上下文问题 |

一个 Session 只服务一个目标。换需求时用 `/new`，不要依赖自动压缩来掩盖混杂的历史。

### `/tree`、`/branch` 与 `/fork`

`/tree` 在当前会话文件中移动叶子指针，可以跳回更早的消息继续工作。原时间线仍保留。

- `/branch`：在同一个会话文件中从历史节点开启新分支；
- `/fork`：把历史克隆到新的会话文件，并记录父会话；
- 标签：在 `/tree` 中为关键节点打标，适合作为高风险重构前的检查点。

选择规则：

- 同一问题的可追溯探索，用 `/branch`；
- 可能整体放弃的替代方案，用 `/fork`；
- 仅仅换了一个无关任务，用 `/new`。

### `/compact` 与 `/handoff`

两者都会减少下一阶段需要处理的历史，但边界不同。

| 手段 | 发生在哪里 | 结果 | 适用场景 |
| --- | --- | --- | --- |
| `/compact [focus]` | 当前会话 | 用摘要替换活跃上下文中的较早部分，磁盘原文仍保留 | 同一任务太长，需要继续 |
| `/handoff [focus]` | 新会话 | 生成交接文档，以其作为继任会话的起点 | 一个阶段结束，下一阶段需要干净上下文 |

示例：

```text
/compact 重点保留 API 重设计决策；迁移脚本只是临时草稿。
```

```text
/handoff 重点记录流式导入器的当前状态、仍未迁移的调用方和验证命令。
```

`/compact` 解决“同一任务的历史太长”，`/handoff` 解决“工作还要继续，但当前阶段已经结束”。

### 会话共享

- `/export [path]`：导出为自包含 HTML，适合只读审阅；
- `/dump`：复制完整纯文本记录；
- `/copy`：复制最后回复、代码块或命令；
- `/share`：通过自定义处理脚本或私密 Gist 分享；
- 原始 JSONL：保留完整谱系，可由接收者继续恢复和迭代。

权威记录是 JSONL，HTML 是渲染视图。需要继续工作时传 JSONL，只需要审阅时传 HTML。

三条硬规则：

1. `/new` 管新目标，`/compact` 管同一目标的历史长度，`/handoff` 管阶段交接；
2. 429 或服务端 5xx 不会被 `/compact` 修复，先看 `/usage` 和错误信息；
3. HTML 导出只适合审阅，能够恢复和继续的权威记录是 JSONL 会话文件。

## 五、上下文、压缩与记忆是三件事

这三个概念经常被混用：

- 上下文窗口：模型在当前轮真正收到的内容；
- 压缩：把一个长会话的旧内容总结后继续；
- 记忆：把跨会话仍有价值的事实带到未来会话。

### 先查 `/context` 和 `/usage`

- `/context` 回答：“下一轮还装得下吗？”
- `/usage` 回答：“当前提供商额度还允许继续吗？”

遇到卡顿或失败时，先区分上下文溢出、速率限制和服务端瞬时故障。盲目 `/compact` 不能解决 429 或服务端 5xx。

### 压缩会保留什么

OMP 会尽量在用户轮次边界切分，保留近期尾部，并把更早的内容归纳成摘要。原始条目仍留在会话文件中，可通过 `/tree` 回溯。

常见配置：

```yaml
compaction:
  enabled: true
  strategy: context-full
  reserveTokens: 16384
  keepRecentTokens: 20000
  autoContinue: true
  idleEnabled: true
```

具体默认值会随版本变化。无人值守或无头任务中，可以关闭 `autoContinue`，避免压缩后自动继续执行。

### 记忆后端

`memory.backend` 常见取值：

| 后端 | 行为 |
| --- | --- |
| `off` | 不提取、不注入记忆 |
| `local` | 从当前项目的历史会话生成本地记忆指引 |
| `hindsight` | 使用远程或自建 Hindsight，通过 `retain`、`recall`、`reflect` 读写 |

本地记忆按项目隔离，可在 TUI 中管理：

| 命令 | 作用 |
| --- | --- |
| `/memory view` | 查看当前注入内容 |
| `/memory clear` | 清除当前项目记忆 |
| `/memory enqueue` | 安排重新整合 |

记忆是启发式上下文，不能凌驾于当前仓库状态。大规模重构后，旧路径可能已经失效；应清理并重建，而不是让过时记忆持续污染判断。

使用远程记忆后端前，要单独评估数据边界。会话默认保存在本地；发送给外部记忆服务的载荷则受该服务部署方式和配置影响。

## 六、五种工作模式怎么选

### 1. `/plan`：先只读规划，再决定是否执行

计划模式把下一轮交给独立的 `plan` 角色模型，并过滤写入类工具。适合多文件修改、执行顺序不明显的重构和高风险设计。

```text
/plan 把 src/importer.ts 改成流式处理，并迁移所有调用方
```

计划批准后通常有三种交接方式：

- 批准并执行：清除计划讨论，只交付最终计划；
- 批准并保留上下文：执行者看到完整讨论；
- 批准并压缩上下文：把讨论总结后继续。

单文件小改动不值得额外走计划轮次。计划的价值来自降低执行风险，不来自形式上的“先写一份计划”。

### 2. `/goal`：让 Agent 围绕验收目标持续推进

目标模式适合跨多轮、下一步可推导、但总工作量未知的任务，例如大规模迁移或持续修复测试。

```text
/goal 将导入器改造成流式处理，更新所有调用方，并用现有测试证明兼容
/goal budget 200000
```

目标模式应有预算。预算耗尽表示“停止扩张并汇报现状”，不等于任务完成。模型只有在能把每项交付映射到文件或命令证据时，才应调用完成。

### 3. `/loop`：重复同一提示词固定次数或固定时长

```text
/loop 10
修复测试套件中下一个失败用例，并在每轮结束后重新运行相关测试
```

`/loop` 没有目标语义，不会判断整体工作是否真的完成。它适合机械迭代，不适合开放式交付。

### 4. `/background`：让当前任务脱离 TUI 继续运行

运行中的会话可用 `/background`（或 `/bg`）分离，随后通过 `omp -c` 重新接入。它常与有明确边界的 `/loop` 或长时间任务配合。

分离不等于验证。回来后仍要检查产物、退出状态和测试结果。

### 5. `/force` 与 `/fast`

- `/force <tool> [prompt]`：只在下一轮锁定指定工具，用于模型持续选择错误工具的情况；
- `/fast`：对支持的 OpenAI 模型切换优先服务层，通常以更高费用换更低延迟。

`/force` 不能修复模糊需求，`/fast` 不能修复糟糕的模型路由。

### 一张选择表

| 需求 | 选择 |
| --- | --- |
| 多文件任务，先论证再动手 | `/plan` |
| 长任务，Agent 应自行根据证据判断完成 | `/goal` + token 预算 |
| 同一动作重复 N 次或持续一段时间 | `/loop` |
| 任务继续跑，人暂时离开 | `/background` |
| 下一轮必须调用某个工具 | `/force` |
| 同一任务上下文过长 | `/compact` |
| 当前阶段结束，下一阶段换干净会话 | `/handoff` |
| 换了一个无关任务 | `/new` |

## 七、扩展、技能与自定义命令

OMP 把扩展入口集中在几个控制面：

| 命令 | 作用 |
| --- | --- |
| `/extensions` | 查看技能、钩子、自定义工具、MCP 和插件 |
| `/agents` | 创建、观察和管理子 Agent |
| `/plugins` | 查看与启停插件 |
| `/reload-plugins` | 重新加载技能、命令、工具、Agent 和 MCP |
| `/mcp` | 管理 MCP 服务 |
| `/tools` | 查看当前 Agent 实际可见的工具 |

用户级命令可放在 `~/.omp/agent/commands/<name>.md`，项目级命令可放在 `<cwd>/.omp/commands/<name>.md`。Markdown 文件会暴露为同名斜杠命令。

示例：

```md
---
description: Review a file or diff
argument-hint: <path-or-diff>
---
Review the following for correctness, edge cases, and observable regressions:

$@
```

保存为 `review.md` 后，可通过 `/review src/auth.ts` 调用。

自定义命令适合轻量、稳定的提示词模板；复杂流程、外部工具和参考资料更适合做成 Skill。不要把所有工作流都塞进 `AGENTS.md`。

## 八、一套可复用的日常工作流

### 小任务

```text
/new
→ 一次说清目标、边界和验证方式
→ 实现
→ 运行最小但能覆盖变更的验证
→ /handoff 或结束会话
```

### 多文件重构

```text
/new
→ /plan：只读分析范围、调用方和迁移顺序
→ 独立 Review 计划
→ 批准并压缩上下文
→ 分阶段实现
→ /context：观察窗口占用
→ 相关测试与实际 smoke test
→ 独立结果 Review
→ /handoff：记录当前状态与剩余工作
```

### 对比两个方案

```text
/tree：给当前节点打标签
→ /fork：建立方案 A
→ 从同一节点再 /fork：建立方案 B
→ 使用相同验收条件比较
→ 保留证据更强的方案，放弃另一条会话
```

### 长时间自主任务

```text
/goal <完整目标与验收标准>
→ /goal budget <上限>
→ 必要时 /background
→ 返回后检查目标状态、文件、测试和日志
```

## 九、最值得先记住的命令

| 命令 | 一句话用途 |
| --- | --- |
| `/model` | 选择模型或角色 |
| `/plan` | 只读规划后再执行 |
| `/new` | 为新任务创建干净会话 |
| `/compact [focus]` | 压缩同一任务的较早上下文 |
| `/tree` | 浏览并跳转会话树 |
| `/branch` / `/fork` | 在同文件分支或派生新文件 |
| `/context` | 查看上下文预算构成 |
| `/usage` | 查看提供商额度与速率限制 |
| `/agents` | 管理子 Agent |
| `/handoff [focus]` | 用结构化交接开启继任会话 |
| `/hotkeys` | 查看当前版本真实快捷键 |
| `/extensions` | 管理扩展、技能、插件和 MCP |

## 十、常见误区

1. 把 `/compact` 当成换任务。 无关任务应 `/new`，否则摘要仍会携带旧目标。
2. 把 `/loop` 当成完成保证。 它只负责重复，不负责证明交付。
3. 为每轮手动选择模型。 应先用角色配置固定常见路由，再按例外升级。
4. 把所有命令输出都送进上下文。 人只需要观察的输出用 `!!` 或外部终端。
5. 依赖教程里的快捷键。 终端协议和版本会改变行为，`/hotkeys` 才是当前环境的答案。
6. 远程记忆开箱即用。 先确认上传内容、隔离范围和清理方式。
7. 只保存 HTML，不保存会话文件。 HTML 适合看；JSONL 才能恢复和继续。

掌握 OMP 的标志，不是记住全部命令，而是能在正确时机切换会话、压缩上下文、拆分任务，并保留足够证据让下一阶段继续。
