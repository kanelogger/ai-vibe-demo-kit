# AI Coding Agent 实战操作手册

更低成本 =
更少重复上下文（RTK、Caveman、headroom、context-mode、会话管理）
+ 更合理模型路由（任务匹配、Skill 绑模型）
+ 更精准代码检索（Graphify、CodeGraph）
+ 更清晰 Agent 分工（subagent 隔离、worktree 并发、记忆外置）

> 先安装 OMP，先改会话和任务说明习惯；确认瓶颈后再加 RTK、Herdr 或上下文工具。不要一次安装全部工具，也不要同时引入两套代码图谱。

## 1. 工具全景与安装顺序

| 层级           | 工具                            | 是否必装       | 解决的问题                                             | 什么时候安装                            |
| -------------- | ------------------------------- | -------------- | ------------------------------------------------------ | --------------------------------------- |
| 核心 Agent     | OMP                             | 是             | 代码阅读、修改、会话树、模型路由、上下文管理、自主任务 | 第一项安装                              |
| 命令输出       | RTK                             | 推荐按需       | 压缩测试、Git、构建等终端输出                          | 命令输出经常占满上下文时                |
| 多会话工作台   | Herdr                           | 按需           | 持久运行多个 Agent、窗格管理、状态可见、断开后继续运行 | 需要长任务、多 Agent 或独立 Reviewer 时 |
| 回复压缩       | Caveman                         | 按需           | 缩短 Agent 的自然语言回复                              | 已明确输出格式，回复仍持续过长时        |
| 综合上下文代理 | headroom                        | 按需           | 压缩文件、工具返回、会话历史，可选记忆和代码图谱       | 多类材料反复进入上下文时                |
| MCP 结果压缩   | context-mode                    | 按需           | 压缩浏览器、数据库、文档等大型 MCP 返回                | MCP 快照是主要上下文来源时              |
| 静态代码图谱   | Graphify                        | 二选一         | 先定位入口、符号和关系，再读源码                       | 大仓库入口难找、语言较多时              |
| 持久代码图谱   | CodeGraph                       | 二选一         | 调用追踪、影响分析、持久化图查询                       | 经常做跨模块追踪和重构影响分析时        |
| 并发代码隔离   | Git worktree                    | 按需，Git 自带 | 防止多个 Worker 同时修改同一工作区                     | 多个独立代码任务需要并发修改时          |
| 真实页面验收   | Agent 内置浏览器或 BrowserSkill | Web UI 必需    | 验证布局、交互、登录态和浏览器行为                     | 交付条件包含真实网页体验时              |

推荐顺序：

```text
OMP
  → 建立正确的会话与验证习惯
  → 观察真实瓶颈
  → RTK（命令输出过长）
  → Herdr（长任务或多 Agent）
  → 只选择一个专项上下文或图谱工具
```

## 2. 安装前准备

按所选工具准备运行时，不需要全部安装：

| 运行时或账号                     | 哪些工具需要                              |
| -------------------------------- | ----------------------------------------- |
| 模型提供商账号、API Key 或 OAuth | OMP                                       |
| Bun 1.3.14 或更高版本            | 仅 OMP 的 Bun 安装方式                    |
| Homebrew                         | macOS 安装 RTK 时                         |
| Git                              | Caveman、worktree，以及正常代码开发       |
| Python 与 `pip`、`uv` 或 `pipx`  | headroom、Graphify                        |
| Node.js 与 npm                   | context-mode、CodeGraph、可选 Herdr Skill |

使用安装脚本安装 OMP 时，不必预先安装 Bun。所有命令执行后都要做对应的验收，不以“安装过程没有报错”作为成功标准。

## 3. 核心环境：OMP

### 3.1 作用

OMP 是主工作入口，整合了：

- 多模型与角色路由；
- 项目上下文和 `AGENTS.md` 自动发现；
- 会话恢复、分支、派生、压缩与交接；
- 计划、目标、循环和后台模式；
- 子 Agent、Skill、插件、MCP 与调试工具；
- 交互式 TUI、单轮 Print、JSON、RPC 和 ACP 接入模式。

### 3.2 安装

任选一种方式，不要重复安装。

**方式 A：已经安装 Bun**

```sh
bun install -g @oh-my-pi/pi-coding-agent
```

**方式 B：自动选择 Bun 或预编译二进制**

```sh
curl -fsSL https://raw.githubusercontent.com/can1357/oh-my-pi/main/scripts/install.sh | sh
```

### 3.3 安装验收

```sh
omp --version
omp config path
omp -p 'hello'
```

三项分别证明：二进制可执行、配置目录可解析、模型调用链可工作。任何一项失败都先修复，不继续叠加插件。

### 3.4 配置认证

API Key 方式适合按量计费的模型提供商：

```sh
export ANTHROPIC_API_KEY=sk-ant-...
# 也可使用 OPENAI_API_KEY、GEMINI_API_KEY、OPENROUTER_API_KEY 等
omp
```

需要订阅账号 OAuth 时，在 OMP 中执行：

```text
/login
```

- `/login` 追加凭据；
- `/logout` 撤销凭据；
- 凭据数据库位于 `~/.omp/agent/agent.db`；
- 迁移机器时同时迁移或重新建立凭据，不能只复制 `config.yml`。

### 3.5 第一次运行

在项目根目录启动：

```sh
cd <project-root>
omp
```

先执行只读任务，验证工作目录、文件读取和模型响应：

```text
概括 src/main.ts 的职责，只读，不修改文件。输出：职责、入口、主要依赖。
```

然后运行：

```text
/hotkeys
```

OMP 使用 Kitty 键盘协议区分 Enter、Shift+Enter 和 Alt 组合键。快捷键以当前终端中的 `/hotkeys` 为准，不以静态教程为准。

### 3.6 日常输入能力

| 操作             | 用法     | 适用情况                          |
| ---------------- | -------- | --------------------------------- |
| 引用文件         | `@`      | 精确把文件加入任务材料            |
| 路径补全         | `Tab`    | 补全相对路径、`../`、`~/`         |
| Shell 命令       | `!`      | 命令输出需要进入模型上下文        |
| 隐藏 Shell 输出  | `!!`     | 只给人看，不让输出占用模型上下文  |
| Python 内核      | `$`      | 计算结果需要进入上下文            |
| 隐藏 Python 输出 | `$$`     | 只做本地计算或人工检查            |
| 外部编辑器       | `Ctrl+G` | 编辑较长的任务说明                |
| 展开工具结果     | `Ctrl+O` | 查看完整命令输出、diff 或工具记录 |

原则：模型后续不需要的信息，用 `!!` 或 `$$`；不要把所有日志都塞进上下文。

### 3.7 配置模型角色

先查询当前可用模型：

```sh
omp --list-models
```

配置文件默认位于 `~/.omp/agent/config.yml`。使用语义角色，而不是在每条提示词里写死模型名：

```yaml
modelRoles:
  default: <常规实现模型>
  smol: <低成本机械任务模型>
  slow: <复杂推理或高风险 Review 模型>
  plan: <只读规划模型>
  commit: <短输出模型>
```

角色职责：

| 角色      | 任务                              |
| --------- | --------------------------------- |
| `default` | 常规实现、代码问答                |
| `smol`    | 分类、机械修改、短摘要            |
| `slow`    | 复杂故障、架构权衡、高风险 Review |
| `plan`    | 多文件任务的只读规划              |
| `commit`  | 提交信息等短而稳定的输出          |

修改后校验：

```sh
omp config list
omp config get modelRoles.default
```

配置优先级是 CLI 参数、环境变量、`config.yml`、内置默认值。YAML 校验失败时先修配置，不继续增加改动。

### 3.8 会话操作决策表

| 需求                           | 操作               | 说明                     |
| ------------------------------ | ------------------ | ------------------------ |
| 开始无关的新任务               | `/new`             | 新目标不继承旧任务历史   |
| 删除当前会话并重建             | `/drop`            | 当前会话确定不再保留     |
| 继续当前项目最近会话           | `omp -c`           | 重新接入最近任务         |
| 选择历史会话                   | `omp -r`           | 查看当前项目会话列表     |
| 临时、不落盘的任务             | `omp --no-session` | 不需要恢复或审计         |
| 同一任务历史太长               | `/compact [focus]` | 当前会话内压缩旧历史     |
| 阶段结束，下一阶段需干净上下文 | `/handoff [focus]` | 创建带结构化交接的新会话 |
| 同一问题内探索分支             | `/branch`          | 仍保存在同一会话文件     |
| 方案可能整体放弃               | `/fork`            | 克隆成新的会话文件       |
| 查看上下文占用                 | `/context`         | 判断下一轮是否装得下     |
| 查看额度和速率限制             | `/usage`           | 区分额度问题与上下文问题 |

压缩示例：

```text
/compact 重点保留 API 重设计决策、已迁移调用方和验证命令；忽略临时探索。
```

交接示例：

```text
/handoff 记录当前实现状态、尚未迁移的调用方、已知风险和下一步验证命令。
```

三条硬规则：

1. `/new` 管新目标，`/compact` 管同一目标的历史长度，`/handoff` 管阶段交接；
2. 429 或服务端 5xx 不会被 `/compact` 修复，先看 `/usage` 和错误信息；
3. HTML 导出只适合审阅，能够恢复和继续的权威记录是 JSONL 会话文件。

### 3.9 工作模式选择

| 场景                           | 模式                     | 操作方式                                     |
| ------------------------------ | ------------------------ | -------------------------------------------- |
| 多文件、高风险、顺序不明显     | `/plan`                  | 先只读分析调用方、迁移顺序和验收，再批准执行 |
| 长任务，下一步可由证据推导     | `/goal`                  | 写完整目标和验收，并设置 token 预算          |
| 固定动作重复 N 次              | `/loop`                  | 机械迭代，每轮重新执行指定检查               |
| 人离开但任务继续               | `/background` 或 `/bg`   | 分离任务，之后用 `omp -c` 重连               |
| 模型下一轮必须调用指定工具     | `/force <tool> [prompt]` | 仅纠正工具选择，不解决模糊需求               |
| 支持的 OpenAI 模型需要更低延迟 | `/fast`                  | 通常以更高费用换优先服务                     |

示例：

```text
/plan 把 src/importer.ts 改成流式处理，迁移所有调用方，并给出验证顺序。
```

```text
/goal 将导入器改成流式处理，更新所有调用方，并用现有测试和实际 smoke test 证明兼容。
/goal budget 200000
```

```text
/loop 10
修复测试套件中下一个失败用例，并在每轮结束后重新运行相关测试。
```

预算耗尽只表示停止扩张并汇报状态，不表示任务已经完成。`/loop` 只保证重复，也不保证最终交付正确。

### 3.10 上下文记忆、扩展与复用

先区分三个概念：

- 上下文窗口：模型下一轮真正收到的内容；
- 压缩：把当前长会话的旧内容总结后继续；
- 记忆：把跨会话仍有价值的信息带入未来会话。

OMP 的常见记忆后端：

| `memory.backend` | 行为                                                 | 适用情况                                 |
| ---------------- | ---------------------------------------------------- | ---------------------------------------- |
| `off`            | 不提取、不注入记忆                                   | 敏感项目或希望完全手工控制上下文         |
| `local`          | 从当前项目历史会话生成本地记忆指引                   | 希望项目内复用经验，不发送到远程记忆服务 |
| `hindsight`      | 通过 Hindsight 的 `retain`、`recall`、`reflect` 读写 | 已单独评估部署、数据边界和清理方式       |

本地记忆管理：

```text
/memory view
/memory clear
/memory enqueue
```

记忆只能作为提示，不能覆盖当前仓库事实。大规模重构后路径已经变化时，清理并重建旧记忆。启用远程后端前确认会话载荷、存储位置、项目隔离和删除方式。

扩展控制面：

| 命令              | 用途                                     |
| ----------------- | ---------------------------------------- |
| `/extensions`     | 查看 Skill、钩子、自定义工具、MCP 和插件 |
| `/agents`         | 创建、观察和管理子 Agent                 |
| `/plugins`        | 查看与启停插件                           |
| `/reload-plugins` | 重新加载 Skill、命令、工具、Agent 和 MCP |
| `/mcp`            | 管理 MCP 服务                            |
| `/tools`          | 查看当前 Agent 实际可见的工具            |

轻量、稳定的提示词模板可以做成自定义命令：

```text
用户级：~/.omp/agent/commands/<name>.md
项目级：<project-root>/.omp/commands/<name>.md
```

示例 `review.md`：

```md
---
description: Review a file or diff
argument-hint: <path-or-diff>
---
Review the following for correctness, edge cases, and observable regressions:

$@
```

保存后使用 `/review src/auth.ts`。固定提示词适合自定义命令；带外部工具、多步流程和参考资料的能力应做成 Skill，不要把所有工作流都堆进 `AGENTS.md`。

共享会话时按接收方需求选择：

| 操作             | 用途                           |
| ---------------- | ------------------------------ |
| `/export [path]` | 导出自包含 HTML，供只读审阅    |
| `/dump`          | 复制完整纯文本记录             |
| `/copy`          | 复制最后回复、代码块或命令     |
| `/share`         | 通过自定义脚本或私密 Gist 分享 |
| 原始 JSONL       | 需要恢复、分支和继续工作       |

在 Agent 工作期间继续输入时，先区分两种队列：Steering 用于根据新证据纠正当前任务；Follow-up 用于当前队列结束后再做下一件事。实际按键以 `/hotkeys` 为准。频繁 Steering 通常说明首条任务契约不完整。

### 3.11 OMP 的典型场景

**小型修复**

```text
/new
→ 一次给全目标、路径、约束和验收
→ 实现
→ 运行能覆盖变更的最小测试或实际 smoke test
→ 结束，或用 /handoff 留下后续状态
```

**多文件重构**

```text
/new
→ /plan：定位全部调用方、风险和迁移顺序
→ 独立 Review 计划
→ 批准并压缩计划上下文
→ 分阶段实现
→ /context 检查窗口占用
→ 相关测试 + 实际 smoke test
→ 独立结果 Review
→ /handoff
```

**对比两个方案**

```text
/tree：为共同起点打标签
→ /fork：方案 A
→ 从同一节点 /fork：方案 B
→ 用完全相同的验收条件比较
→ 保留证据更强的方案
```

**脚本或 CI 单轮任务**

```sh
omp -p "检查指定 diff 是否遗漏公开调用方；输出 JSON"
omp --mode json -p "分析构建失败"
```

## 4. 不安装工具也必须执行的上下文规范

任何压缩插件都不能补救模糊目标和混杂会话。先执行以下规范。

### 4.1 一个 Session 只处理一个目标

修 Bug、重构、写文档、排查线上故障分别建立会话。目标变化时用 `/new`，不要依赖自动压缩隐藏任务混杂。

### 4.2 第一条指令使用固定任务契约

复制下面的模板，删除不适用项：

```text
目标：<最终要发生什么>
入口：<文件、符号、URL 或命令>
允许修改：<路径或模块>
非目标：<明确不做什么>
约束：<兼容性、性能、安全、不能修改的内容>
验收：<测试、命令、真实操作路径及可观察结果>
输出：<结论、diff、JSON schema、验证结果等>
```

示例：

```text
目标：修复批量导入遇到空行时提前结束的问题。
入口：src/importer.ts:40-120，tests/importer.test.ts。
允许修改：导入器和对应测试。
非目标：不改变 CSV schema，不引入重试机制。
约束：保留流式处理，不能把整个文件读入内存。
验收：现有导入测试通过；新增包含中间空行的输入后，后续记录仍被导入；运行一次 CLI smoke test。
输出：修改文件、根因、验证命令与结果。不要复述需求。
```

### 4.3 只给必要材料

- 给完整路径和必要行号范围；
- 不用“看一下配置”代替明确入口；
- 不因害怕搜索就把整个仓库放进上下文；
- 先给稳定约束，再给任务、时间、日志等动态内容，有利于 Prompt Cache；
- 低频 Skill、Agent、MCP 和插件按需启用。

### 4.4 工具选择顺序

```text
已有专用工具
  > 确定性 CLI 或脚本
  > 通用 MCP
  > 浏览器自动化
```

Web UI 是例外：布局、交互、登录态和浏览器兼容性必须用真实浏览器验证。CLI 和单元测试不能证明页面真实可用。

### 4.5 成本观测指标

不要只看 Token。每次优化至少记录：

- 输入与输出 Token；
- 总费用；
- 工具调用次数；
- 失败和重试次数；
- 从开始到可验收结果的时间；
- 人工纠偏次数。

低价模型连续返工，通常比一次使用合适模型更贵。

## 5. 命令输出压缩：RTK

### 5.1 作用

RTK 过滤 ANSI、进度条、重复告警、注释和空行，减少测试、Git、构建和搜索输出进入 Agent 上下文的体积。它不应删除退出状态和关键错误。

### 5.2 安装与初始化

**macOS**

```sh
brew install rtk
```

**Linux 或 WSL**

```sh
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/master/install.sh | sh
```

为 OMP 初始化：

```sh
rtk init -g --agent omp
```

其他 Agent 可使用相应参数：

```sh
rtk init -g --codex
rtk init -g --gemini
rtk init -g --agent cursor
```

### 5.3 后续使用

在常规命令前加 `rtk`：

```sh
rtk git status
rtk npm test
rtk cargo test
```

观察实际收益：

```sh
rtk gain
rtk gain --history
rtk discover
```

### 5.4 典型场景

- 测试套件输出数百行成功记录，只需保留失败和摘要；
- Git diff、status 或 log 含大量低价值信息；
- 构建工具反复打印进度、警告和重复依赖信息；
- 搜索结果需要紧凑呈现给 Agent。

### 5.5 不适用与回退

- 命令本身范围过大时，先缩小命令范围；
- 失败诊断需要完整原始日志时，针对该次失败运行原始命令复查；
- 验收标准是“保留退出状态和关键错误”，不是单纯追求最高压缩率。

## 6. 多 Agent 工作台：Herdr

### 6.1 作用

Herdr 是面向 Coding Agent 的终端多路复用器：

- Session 承载持久后台服务；
- Workspace 对应项目或独立调查；
- Tab 划分 planner、implementation、verification、evidence 等职责；
- Pane 运行真实终端进程；
- Agent 集成上报 `working`、`blocked`、`done`、`idle`、`unknown` 等状态；
- 客户端断开后，后台窗格和 Agent 仍可继续运行。

Herdr Session 负责进程持续；OMP Session 负责对话和上下文。两者不能混为一谈。

### 6.2 安装与 OMP 集成

Linux 和 macOS 使用官方稳定版安装脚本：

```sh
curl -fsSL https://herdr.dev/install.sh | sh
herdr --version
```

安装 OMP 集成：

```sh
herdr integration install omp
herdr integration status
```

然后在 Herdr 新窗格中启动新的 OMP 进程：

```sh
herdr
# 在 Herdr 窗格内
omp
```

集成安装前已经运行的 OMP 进程不会自动加载新扩展，应重启该 OMP 进程。OMP 集成默认写入：

```text
~/.omp/agent/extensions/herdr-omp-agent-state.ts
```

可选：让支持开放 Skill 的 Agent 学会从窗格内控制 Herdr：

```sh
npx skills add herdrdev/herdr --skill herdr -g
```

先读取当前版本的权威能力和快捷键：

```sh
herdr --skill
```

进入 Herdr 后使用 `prefix+?` 查看实时键位。`prefix` 默认表示先按 `Ctrl+B`，松开，再按操作键。

### 6.3 最少需要记住的操作

| 操作           | 默认键位         |
| -------------- | ---------------- |
| 查看当前快捷键 | `prefix+?`       |
| 新建标签页     | `prefix+c`       |
| 向右分屏       | `prefix+v`       |
| 向下分屏       | `prefix+-`       |
| 窗格间移动     | `prefix+h/j/k/l` |
| 打开工作区导航 | `prefix+w`       |
| 缩放当前窗格   | `prefix+z`       |
| 关闭当前窗格   | `prefix+x`       |
| 分离客户端     | `prefix+q`       |

第一次使用优先通过鼠标单击、右键、拖动分隔线理解对象层级，再学习快捷键。

### 6.4 60 秒安装验收

1. 运行 `herdr`；
2. 用 `prefix+?` 打开快捷键帮助；
3. 用 `prefix+v` 创建右侧窗格；
4. 在新窗格运行 `pwd`；
5. 在两个窗格之间切换；
6. 关闭临时窗格；
7. 用 `prefix+q` 分离客户端；
8. 从外部普通终端再次运行 `herdr`；
9. 确认原布局和剩余进程仍在；
10. 启动 OMP 后运行以下命令确认识别来源：

```sh
herdr agent list
herdr integration status
herdr agent explain <agent-name-or-pane-id> --json
```

只看到 Agent 名称不够；还要确认状态来自原生集成，而不是终端画面推测。

### 6.5 推荐布局

```text
Workspace: current-project
├── Tab: planner
│   └── Pane 1: Orchestrator / Planner
├── Tab: implementation
│   ├── Pane 1: Implementer A
│   └── Pane 2: Implementer B（仅文件范围独立时）
├── Tab: verification
│   ├── Pane 1: tests / build / server
│   └── Pane 2: 独立 Reviewer
└── Tab: evidence
    ├── Pane 1: logs
    └── Pane 2: diff / benchmark
```

布局只提供可见性。派工前仍需写清：目标、允许修改的文件、输入输出路径、依赖、是否可并行和验收证据。

### 6.6 分离、重连与停止

```text
prefix+q             分离客户端，后台任务继续
关闭外层终端         通常同样只分离
从外部运行 herdr     重新连接
herdr server stop    停止服务器及所有窗格进程
```

`herdr server stop` 是破坏性操作。普通 shell、开发服务器和其他进程会被终止。长任务离开前让阶段产物持续写入文件，不能只依赖进程内存。

### 6.7 诊断顺序

```sh
herdr status
herdr status server
herdr status client
herdr agent list
herdr integration status
herdr agent explain <target> --json
```

默认日志：

```text
~/.config/herdr/herdr.log
~/.config/herdr/herdr-client.log
~/.config/herdr/herdr-server.log
```

配置文件通常位于 `~/.config/herdr/config.toml`。没有明确需求时使用默认配置；需要查看或重载时：

```sh
herdr --default-config
herdr server reload-config
```

### 6.8 典型场景

- 长时间迁移或测试修复，人离开终端后任务继续；
- Planner、Implementer、Reviewer 使用独立会话，避免上下文互相污染；
- 多个互不依赖的模块并行实现；
- 单独保留测试、开发服务器、日志和 benchmark 窗格；
- 需要快速看到哪个 Agent 正在工作、阻塞或等待查看。

不适合：任务很小、只有一个短会话，或多个 Worker 必须持续修改同一文件。

## 7. 独立 Review 标准流程

Herdr 负责承载会话，不能自动保证质量。Review 必须引入新的方法、风险先验、外部证据和独立上下文。

### 7.1 五阶段流程

**阶段 1：计划**

Planner 输出并落盘：目标、非目标、调用方、风险、迁移顺序、回滚边界和验收命令。

**阶段 2：计划 Review**

Reviewer 使用新会话，只读取需求和计划，检查：

- 是否遗漏调用方；
- 约束是否矛盾；
- 是否存在不可回滚步骤；
- 验证范围是否小于改动范围；
- 是否把未经验证的假设写成事实。

**阶段 3：实现**

Implementer 只读取最终计划和相关源码。文件范围独立时才并行；共享文件或有顺序依赖时串行。并发改动需要 Git worktree 隔离。

**阶段 4：结果 Review**

Reviewer 不读取实现者的完整聊天，只读取：

```text
需求
+ 最终 diff
+ 覆盖变更契约的测试
+ typecheck / lint
+ 实际 runtime smoke test
+ 相关日志或 benchmark
```

**阶段 5：缺陷修复**

每个已证实缺陷建立边界清晰的修复会话。修复后重跑能证明缺陷消失的最小场景，并检查回归。

### 7.2 可复制的 Reviewer 提示词

```text
你是独立 Reviewer。不要沿用实现者的结论；只根据下列需求与证据判断。

输入：
- 需求：<path>
- 最终 diff：<path or command output>
- 相关测试结果：<path>
- 类型检查 / lint：<path>
- 运行时 smoke test 与日志：<path>

重点风险：
- 公开接口或调用方遗漏
- 并发与状态恢复
- 空值、边界输入和错误路径
- 测试污染、假阳性和验证范围不足

输出：
1. 仅列真实、可定位的问题，按严重度排序；
2. 每项给出文件与行号、触发条件、可观察影响；
3. 证据不足时写“未证实”，并说明缺什么；
4. 没有问题时直接说明，并列出仍未被当前证据覆盖的风险。
```

`done` 只代表 Agent 进程认为工作结束，不代表验收通过。

## 8. 专项上下文工具

只在基线证明有对应瓶颈时安装。每次只引入一个变量，比较安装前后数据。

### 8.1 Caveman：压缩 Agent 回复

**安装**

```sh
git clone https://github.com/studyzy/caveman
cd caveman
./install.sh
```

该来源是支持 OMP 的 Fork，安装前检查当前版本兼容性。

**使用**

```text
/caveman
```

关闭：

```text
stop caveman
```

**典型场景**

- 人只需要简洁结论；
- 常规开发回复过长，已经明确输出契约仍有大量冗余。

**不要使用**

- 需要完整推理或审计记录；
- 长篇文稿；
- 必须严格符合 JSON schema 的机器输出。

### 8.2 headroom：压缩文件、工具返回和会话历史

**安装**

```sh
pip install "headroom-ai[all]"
```

**使用**

```sh
headroom wrap omp
```

需要评估可选记忆与代码图谱时：

```sh
headroom wrap omp --memory --code-graph
```

MCP 模式：

```sh
headroom mcp install
```

**典型场景**

- 同一批文件、工具输出和历史反复进入长会话；
- 需要在一个代理层统一压缩多类材料；
- 已经修正会话边界，仍存在可测量的上下文浪费。

**上线前验收**

- 被压缩引用能否回取；
- 代码块是否完整；
- 关键错误日志是否被误压；
- 记忆和缓存存在哪里；
- 敏感数据是否离开本机或项目边界。

### 8.3 context-mode：压缩大型 MCP 返回

**安装**

```sh
npm install -g context-mode
```

按该包当前版本的说明接入所使用的 Agent 或 MCP 后，使用诊断入口：

```text
/context-mode:ctx-doctor
/context-mode:ctx-stats
/context-mode:ctx-insight
```

**典型场景**

- 浏览器快照体积很大；
- 数据库查询或文档工具频繁返回大块内容；
- `/compact` 前后的工具材料需要本地可检索连续性。

如果根因是多个目标混在同一 Session，先改会话边界。context-mode 只能推迟上下文爆满，不能修正任务混杂。

### 8.4 Graphify：轻量静态代码图谱

**安装，二选一**

```sh
uv tool install graphifyy
```

或：

```sh
pipx install graphifyy
```

安装 OMP 集成：

```sh
graphify install --platform omp
# 某些版本使用：graphify omp install
```

之后按当前插件说明执行项目图谱扫描。

**典型场景**

- 多语言仓库；
- 入口文件不明确；
- 模块关系复杂，Agent 经常盲目读取大量文件；
- 希望先定位符号和关系，再读取小范围源码。

小仓库或调用关系简单时，先用明确入口、LSP 和代码搜索，不维护额外索引。

### 8.5 CodeGraph：持久化代码图数据库

**安装**

```sh
npm i -g @colbymchenry/codegraph
cd <project-root>
codegraph init -i
```

MCP 配置示例：

```json
{
  "mcpServers": {
    "codegraph": {
      "type": "stdio",
      "command": "codegraph",
      "args": ["serve", "--mcp"]
    }
  }
}
```

**常用能力**

| 工具                | 用途               |
| ------------------- | ------------------ |
| `codegraph_context` | 找入口和相关上下文 |
| `codegraph_trace`   | 追踪调用路径       |
| `codegraph_impact`  | 重构前评估影响范围 |

**典型场景**

- 经常进行跨模块调用追踪；
- 重构前需要稳定的影响分析；
- 项目足够大，持久索引的维护成本低于重复扫描成本。

图查询本身也会产生高密度上下文。验收时同时统计少读了多少文件，以及图查询结果新增了多少 Token。

### 8.6 Graphify 与 CodeGraph 怎么选

| 需求                                                  | 选择       |
| ----------------------------------------------------- | ---------- |
| 希望用 Tree-sitter 快速生成静态关系图，先缩小读取范围 | Graphify   |
| 需要持久图数据库、调用追踪和影响分析                  | CodeGraph  |
| 小仓库、入口清楚                                      | 两者都不装 |

先在一个真实任务上测试一种工具。不要同时安装后再凭感觉判断收益。

## 9. 多 Agent 编排操作规范

### 9.1 Orchestrator 的职责

Orchestrator 在派工前必须定义：

- Worker 的单一目标；
- 输入路径和必要上下文；
- 允许读取或修改的文件；
- 输出文件或 schema；
- 依赖关系；
- 验收证据；
- 可并行还是必须串行。

Orchestrator 不能只转发用户原始需求。

### 9.2 通过结构化文件交接

不要把 Worker 的完整会话复制给下一个 Worker。示例：

```text
Worker A → .agent/findings.json
Worker B → 读取 findings.json 和相关源码 → .agent/fix-result.json
Worker C → 读取 fix-result.json 和现有测试 → 测试证据
```

发现文件示例：

```json
{
  "task": "locate-order-bug",
  "status": "completed",
  "findings": [
    {
      "file": "src/api/order.go",
      "line": 142,
      "issue": "错误路径未释放 inventory lock",
      "severity": "high"
    }
  ],
  "next_step": "fix-bug",
  "context_needed": [
    "src/api/order.go:120-165",
    "src/model/inventory.go:30-55"
  ]
}
```

状态文件只记录协作事实，不写成另一份聊天日志。任务完成后按仓库规则归档或删除临时 `.agent/` 文件；删除前确认审阅证据已经保留。

### 9.3 并行与串行判断

**可以并行**

- 不同模块、修改文件不重叠的 Bug；
- 对同一稳定 diff 分别做测试缺口分析和变更说明；
- 多个互不依赖的资料收集任务；
- 两种方案在隔离工作区内实验。

**必须串行**

- 先定位 Bug，才能决定修复方式；
- 测试必须读取最终实现；
- 多个 Worker 修改同一文件或共享状态；
- 下游输入 schema 尚未确定。

并行主要减少墙上时间，不保证减少总 Token。两个 Worker 重复读取同一背景时，总费用可能更高。

## 10. 典型场景操作卡

### 场景 A：日常单文件 Bug

**安装**：OMP；命令输出很长时加 RTK。

**流程**：

1. `/new`；
2. 用任务契约给出根因入口、允许修改范围和验收；
3. 实现；
4. 运行能复现该 Bug 的最小场景；
5. 运行相关回归检查；
6. 输出修改文件、根因和验证证据。

不要启用 Herdr、多 Agent 或图数据库。

### 场景 B：跨模块重构

**安装**：OMP；大仓库按需选 Graphify 或 CodeGraph；需要独立 Review 时加 Herdr。

**流程**：

1. `/plan` 找齐公开接口和调用方；
2. 独立 Reviewer 审查计划；
3. 按依赖顺序迁移；
4. 只对互不重叠的模块并行；
5. 运行 changed-contract tests、typecheck 和实际 smoke test；
6. Reviewer 只读需求、最终 diff 和验证证据；
7. `/handoff` 记录剩余工作。

### 场景 C：长时间测试修复或迁移

**安装**：OMP；需要离开终端时加 Herdr；输出噪声大时加 RTK。

**流程**：

1. 用 `/goal` 写完整交付和验收；
2. 设置 `/goal budget <上限>`；
3. 机械重复步骤才使用 `/loop`；
4. 在 Herdr 中保留 Agent、测试和日志窗格；
5. 用 `prefix+q` 分离，不停止服务器；
6. 返回后检查文件、退出状态、测试和日志，不把 Agent 的 `done` 当成完成证明。

### 场景 D：多个独立 Bug 并行修复

**安装**：OMP、Herdr、Git；按需使用 RTK。

**流程**：

1. Orchestrator 先定义每个 Bug 的文件范围和验收；
2. 每个 Worker 使用独立 worktree 和 OMP Session；
3. 在 Herdr 中每个窗格只承载一个职责；
4. Worker 输出结构化结果，不转发完整历史；
5. 合并后统一运行最终测试和 smoke test；
6. 独立 Reviewer 基于合并后的最终 diff 审查。

### 场景 E：MCP 或浏览器快照占满上下文

**安装**：先不加工具；确认问题持续后再加 context-mode。

**流程**：

1. 缩小页面元素、查询字段或文档范围；
2. 使用稳定输出 schema；
3. 仍然过大时安装 context-mode；
4. 用 `ctx-stats` 观察收益；
5. Web UI 的最终验收仍使用真实浏览器，不用压缩后的文本快照替代。

### 场景 F：Agent 不知道该读哪些文件

**安装**：先不加工具；大仓库再选择 Graphify 或 CodeGraph。

**流程**：

1. 人工给出已知入口；
2. 使用 LSP、符号搜索或代码搜索；
3. 记录盲目读取的文件数和耗时；
4. 选择一种图谱工具做同任务对照；
5. 只有文件读取量、总时间或返工显著下降时保留。

## 11. 分阶段落地清单

### 今天完成

- [ ] 安装并验收 OMP；
- [ ] 配置一个模型提供商；
- [ ] 运行 `/hotkeys`；
- [ ] 用只读任务确认项目上下文；
- [ ] 建立“一个 Session 一个目标”的习惯；
- [ ] 开始使用任务契约；
- [ ] 学会 `/new`、`/compact`、`/handoff`、`/context` 和 `/usage`。

### 本周完成

- [ ] 按 Planner、Implementer、Reviewer、Mechanical Worker 配置模型角色；
- [ ] 为升级到强模型定义条件，例如公开 API、跨模块、并发、权限或数据迁移；
- [ ] 建立 Token、费用、工具调用、重试、交付时间和人工纠偏基线；
- [ ] 若命令输出确实过长，安装 RTK 并用 `rtk gain` 观察；
- [ ] 若需要长任务或独立 Review，安装 Herdr 并完成 60 秒冒烟演练。

### 本月按瓶颈选择

- [ ] MCP 返回巨大时评估 context-mode；
- [ ] 多类材料反复进入上下文时评估 headroom；
- [ ] 回复持续过长时评估 Caveman；
- [ ] 大仓库入口定位困难时只选择 Graphify 或 CodeGraph；
- [ ] 多 Agent 编排使用结构化输入输出文件；
- [ ] 删除没有可测收益的插件、Skill、MCP 和索引。

## 12. 常见失败模式

1. **把 `/compact` 当成换任务。** 新目标应使用 `/new`。
2. **把 `/loop` 当成交付保证。** 它只执行重复，不判断整体完成。
3. **一开始就使用最贵模型。** 应按语义角色路由，并定义升级条件。
4. **只追求最低 Token。** 返工、等待和人工纠偏也属于成本。
5. **一次安装全部压缩工具。** 无法判断哪项有效，还会增加固定上下文和维护面。
6. **同时安装 Graphify 和 CodeGraph。** 应先做单工具对照实验。
7. **把 Herdr 的 `done` 当成验收通过。** 状态不是测试或 smoke test。
8. **多个 Agent 修改同一工作区。** 重叠范围应串行，独立范围使用 worktree。
9. **Reviewer 阅读实现者完整聊天。** 容易继承同一假设，应读取需求和最终证据。
10. **混淆分离与停止。** `prefix+q` 保留任务，`herdr server stop` 终止进程。
11. **压缩失败日志后不看原文。** 过滤可能隐藏诊断细节，失败时按需回看原始输出。
12. **用 CLI 或测试代替 Web UI 验收。** 真实页面必须在浏览器里完成实际用户路径。
13. **盲目使用远程记忆。** 先确认上传内容、隔离范围、存储位置和清理方式。

## 13. 最终决策表

| 当前症状                                     | 先做                          | 仍未解决再安装        |
| -------------------------------------------- | ----------------------------- | --------------------- |
| 测试、Git、构建输出过长                      | 缩小命令范围                  | RTK                   |
| Agent 回复太长                               | 指定输出契约                  | Caveman               |
| 浏览器或 MCP 快照巨大                        | 缩小元素、字段或查询范围      | context-mode          |
| 文件、工具结果、历史反复进入上下文           | 改 Session 边界和材料提取流程 | headroom              |
| Agent 不知道读哪些文件                       | 给入口，使用 LSP 和代码搜索   | Graphify 或 CodeGraph |
| 长任务需要断开终端继续                       | OMP `/background`             | Herdr                 |
| 需要 Planner、Implementer、Reviewer 独立运行 | 先定义职责和证据契约          | Herdr                 |
| 多个 Worker 并发改代码                       | 先确认文件范围独立            | Git worktree          |
| Web UI 需要验收                              | 打开实际页面走完整路径        | Agent 浏览器集成      |

工具选择的验收标准只有一个：在不降低正确率和证据质量的前提下，用更少的总成本拿到可验收结果。

## 参考材料

- [01-OMP完全指南.md](./01-OMP完全指南.md)
- [02-AI-Coding-Agent成本与上下文工程.md](./02-AI-Coding-Agent成本与上下文工程.md)
- [03-Herdr多Agent协作与独立Review.md](./03-Herdr多Agent协作与独立Review.md)
- [Herdr Agent Guide](https://herdr.dev/agent-guide.md)
- [Herdr Integrations](https://herdr.dev/zh-cn/docs/integrations/)

> 版本提醒：OMP、Herdr、插件和模型 ID 都会变化。OMP 快捷键以 `/hotkeys` 为准，模型 ID 以 `omp --list-models` 为准，Herdr 能力以 `herdr --skill`、`prefix+?` 和当前官方文档为准。
