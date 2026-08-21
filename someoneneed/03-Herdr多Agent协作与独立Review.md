# Herdr 多 Agent 协作与独立 Review：把并行会话变成可靠工作台

多 Agent 工作流落到真实终端后，会出现一组新的工程问题：进程如何持续运行、窗口怎样组织、哪个 Agent 正在工作、断开终端后任务是否还活着、Reviewer 如何保持独立。

Herdr 的作用是承载这些会话。它是面向 AI Coding Agent 的终端多路复用器：用工作区、标签页和窗格管理长期运行的 Agent 进程，并通过集成识别生命周期状态。

它不会替你拆任务，也不会自动保证并行安全。任务边界、共享数据和验收证据仍需在工作流层明确。

> 原始配置记录验证的是 Herdr 0.8.0 stable 与 OMP 集成。Herdr 仍在迭代；快捷键、集成版本和状态字段应以 `herdr --skill`、`prefix+?` 及当前官方文档为准。

## 一、先建立正确的心智模型

按以下层级理解 Herdr：

1. **Session（会话）**：持久运行的后台服务器；
2. **Workspace（工作区）**：项目级容器，通常对应一个仓库或一项独立调查；
3. **Tab（标签页）**：工作区内的一套窗格布局，例如 `planner`、`workers`、`server`、`logs`；
4. **Pane（窗格）**：真实终端进程；客户端断开后，窗格仍可继续运行；
5. **Agent（智能体）**：Herdr 在窗格中识别出的 AI Coding Agent 进程；
6. **Mode（操作模式）**：终端输入、前缀操作和持续导航三类交互状态。

最容易混淆的是 Session 与 Agent：Herdr Session 是承载工作区和终端进程的后台服务；OMP Session 是某个 Agent 的对话与会话树。前者保证进程持续，后者保存 Agent 上下文。

### Agent 状态

| 状态 | 含义 |
| --- | --- |
| `working` | 正在处理任务 |
| `blocked` | 等待批准、权限或用户回答 |
| `done` | 后台任务已完成，但对应标签页尚未查看 |
| `idle` | Agent 可接收输入，且标签页已被查看 |
| `unknown` | 已识别进程，但无法可靠判断生命周期 |

状态是调度信号，不是质量信号。`done` 只说明进程认为自己完成，不能证明实现正确。

## 二、最小上手路径

### 实测基线：Herdr 0.8.0 stable

原始配置记录保留了一组可复核的环境快照。它不是当前版本保证，但可以作为安装后的验收清单：

| 检查项 | 实测结果 |
| --- | --- |
| 版本与通道 | Herdr `0.8.0`，`stable` 通道 |
| 后台连接 | 客户端与服务器均在运行，协议版本兼容 |
| OMP 识别 | 侧边栏已检测到 OMP |
| OMP 集成 | `current (v8)`；文件为 `~/.omp/agent/extensions/herdr-omp-agent-state.ts` |
| Agent Skill | 全局启用且状态为 `healthy`；入口为 `~/.agents/skills/herdr` |
| 配置文件 | `~/.config/herdr/config.toml` 不存在，确认正在使用默认配置 |
| 窗格冒烟 | 创建右侧分屏、运行验证命令、读取输出、关闭窗格后，原布局恢复 |

集成安装前已经启动的 OMP 进程可能仍使用终端画面检测；新启动进程才会加载集成。验收时应同时检查“进程被识别”和“状态来源是原生集成”，不要只看侧边栏是否出现名称。

### 1. 先读当前版本能力

资料入口：

- [Herdr GitHub](https://github.com/herdrdev/herdr)
- [Agent Guide](https://herdr.dev/agent-guide.md)
- [Integrations](https://herdr.dev/zh-cn/docs/integrations/)
- [Agent Skill](https://herdr.dev/zh-cn/docs/agent-skill/)
- [Core Concepts](https://herdr.dev/docs/concepts/)
- [Keyboard Guide](https://herdr.dev/docs/keyboard/)
- [Session State](https://herdr.dev/docs/session-state/)

在终端中运行：

```sh
herdr --skill
```

它给出的内容比静态文章更接近当前版本。安装与升级也应遵循当前官方指南。

### 2. 优先使用鼠标熟悉结构

第一次进入 Herdr，不必先背快捷键：

- 单击工作区、标签页、窗格或 Agent 以聚焦；
- 通过右键菜单创建、分屏、重命名或关闭对象；
- 拖动分隔线调整窗格大小；
- 在终端中拖动选择文本并复制。

先看懂对象层级，再学前缀键，出错率更低。

### 3. 只记最少的前缀操作

`prefix` 表示：先按 `Ctrl+B`，松开，再按操作键。

| 操作 | 默认按键 |
| --- | --- |
| 查看当前生效快捷键 | `prefix+?` |
| 新建标签页 | `prefix+c` |
| 向右分屏 | `prefix+v` |
| 向下分屏 | `prefix+-` |
| 在窗格之间移动 | `prefix+h/j/k/l` |
| 打开工作区导航 | `prefix+w` |
| 缩放当前窗格 | `prefix+z` |
| 关闭当前窗格 | `prefix+x` |
| 分离客户端 | `prefix+q` |

静态表只用于入门。升级后以 `prefix+?` 为准。

### 4. 在窗格中启动 OMP

新窗格就是普通终端，直接运行：

```sh
omp
```

安装 OMP 集成后，新启动的进程可以上报更可靠的生命周期状态与原生会话标识。用于检查识别情况的命令：

```sh
herdr agent list
herdr integration status
herdr agent explain <agent-name-or-pane-id> --json
```

`agent explain` 可以帮助区分：当前状态来自原生集成，还是仅根据终端画面推测。只看到 `unknown` 时，不要立即判断 Agent 卡死；先检查集成状态和进程输出。

## 三、分离客户端不等于终止任务

在 Herdr 中按 `prefix+q`，或关闭外层终端窗口，客户端会断开，但后台服务器中的窗格和 Agent 进程仍可继续运行。

重新连接：

```sh
herdr
```

不要在 Herdr 的现有窗格里嵌套启动另一个不带参数的 `herdr`；应从外部普通终端重新连接。

### 破坏性边界

```sh
herdr server stop
```

这条命令会停止服务器及其窗格进程。布局和受支持的 Agent 会话可能可恢复，但普通 shell 命令、开发服务器和其他任意进程已经终止。

因此要严格区分：

- `prefix+q`：分离客户端，保留后台任务；
- 关闭外层终端：通常同样只分离；
- `herdr server stop`：终止后台进程。

长任务离开前，先确认产物会持续落盘。进程活着不代表中间状态可恢复。

## 四、诊断顺序

遇到“Agent 没显示”“状态不更新”“无法重新连接”时，按层排查：

```sh
herdr status
herdr status server
herdr status client
herdr agent list
herdr integration status
herdr agent explain <target> --json
```

默认日志位置：

```text
~/.config/herdr/herdr.log
~/.config/herdr/herdr-client.log
~/.config/herdr/herdr-server.log
```

需要自定义时，配置文件通常位于：

```text
~/.config/herdr/config.toml
```

相关命令：

```sh
herdr --default-config
herdr server reload-config
```

没有明确需求时先保留默认配置。配置项越多，升级和排障面越大。

### 60 秒冒烟演练

1. 用 `prefix+?` 打开快捷键帮助；
2. 用 `prefix+v` 创建右侧窗格；
3. 在新窗格运行 `pwd`；
4. 用鼠标和前缀键在窗格之间切换；
5. 关闭临时窗格；
6. 用 `prefix+q` 分离；
7. 从普通终端运行 `herdr` 重新连接；
8. 确认原布局和剩余进程仍在。

这个演练验证的是最重要的运行契约：分屏、聚焦、分离与恢复。

## 五、把 Herdr 布局映射到 Agent 职责

不要为了“像黑客终端”开十个没有边界的 Agent。先为每个标签页定义职责。

一个常用布局：

```text
Workspace: current-project
├── Tab: planner
│   └── Pane 1: Orchestrator / Planner
├── Tab: implementation
│   ├── Pane 1: Implementer A
│   └── Pane 2: Implementer B（仅在文件范围独立时）
├── Tab: verification
│   ├── Pane 1: tests / build / server
│   └── Pane 2: Reviewer
└── Tab: evidence
    ├── Pane 1: logs
    └── Pane 2: diff / benchmark
```

布局只负责可见性，协作契约仍要写清：

- 每个 Agent 的目标；
- 允许读取和修改的文件；
- 输入与输出路径；
- 依赖关系；
- 何时可并行；
- 验收证据。

需要 Agent 间通信时，先阅读当前版本的 `herdr --skill` 和 CLI 帮助。不要从旧文章猜命令，也不要把完整会话历史互相复制；优先传结构化结果文件。

## 六、为什么独立 Review 比“再想一遍”更可靠

原始笔记引用了论文《When Can LLMs Actually Correct Their Own Mistakes?》。它给出的实践结论是：没有可靠外部反馈时，模型只靠自我反思，难以稳定纠正错误。

有效 Review 的增量来自四类信息：

1. 新的方法：从反方、失效条件或特定风险出发；
2. 新的先验：并发、状态恢复、边界输入、测试污染等高风险点；
3. 新的证据：需求、diff、测试、类型检查、日志、benchmark；
4. 新的独立性：使用干净会话，必要时更换模型或角色。

可以写成一个心智模型：

```text
Review Quality ≈
  Reviewer Capability
× Risk Prior
× Verification Signal
× Independence
```

任何一项接近零，Review 都容易退化成措辞不同的重复回答。

### 四种 Review 提示的质量差异

| 类型 | 示例 | 信息增量 |
| --- | --- | --- |
| 无信息 Review | “检查一下有没有问题。” | 几乎没有 |
| 有方法 Review | “站在反方立场，找出会让方案失败的条件。” | 提供搜索方向 |
| 有风险先验 Review | “重点检查并发、恢复、边界条件和测试污染。” | 缩小高风险空间 |
| 有外部证据 Review | “基于需求、diff、测试、lint、类型检查和日志判断。” | 提供可验证事实 |

最强的提示不是最凶的语气，而是证据最完整、风险范围最明确。

## 七、在 Herdr 中执行独立 Review

### 阶段 1：计划

Planner 在独立标签页中输出：目标、非目标、调用方、风险、迁移顺序和验收命令。计划先落盘，不直接交给同一会话“自我审阅”。

### 阶段 2：计划 Review

Reviewer 使用新会话，只读取需求与计划，重点找：

- 未覆盖的调用方；
- 互相矛盾的约束；
- 不可回滚步骤；
- 验证范围小于改动范围；
- 把假设写成事实的地方。

计划确认后再实现。

### 阶段 3：实现

Implementer 只读取最终计划与相关文件。独立模块可分窗格并行；共享文件或有顺序依赖的步骤必须串行。

### 阶段 4：结果 Review

Reviewer 不读取 Implementer 的完整对话，只读取真实交付证据：

```text
Requirements
+ final diff
+ changed-contract tests
+ typecheck / lint
+ runtime smoke test
+ relevant logs or benchmark
```

这样能降低“沿用实现者叙事”的锚定效应。

### 阶段 5：缺陷修复

每个真实缺陷建立边界清晰的修复会话。修复后重新运行能证明该缺陷消失的最小场景，并检查是否引入回归。

## 八、可复制的 Review 提示词

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

这段提示词把 Review 变成反例搜索与证据审计，而不是礼貌性复述。

## 九、常见失败模式

1. **窗格数量等于 Agent 数量。** 没有任务边界时，多开窗格只会复制上下文。
2. **把 `done` 当成验收通过。** 生命周期状态不能替代测试和 smoke test。
3. **所有 Agent 修改同一工作区。** 文件范围重叠时应串行，或使用 Git worktree 隔离。
4. **Reviewer 读取实现者完整聊天。** 容易继承同一假设；优先读取需求与最终证据。
5. **Review 只说“检查一下”。** 没有风险先验和外部信号，信息增量太低。
6. **分离与停止混淆。** `prefix+q` 保留进程，`herdr server stop` 会终止进程。
7. **长期任务只留在内存。** 进程可能退出；阶段结果、状态和证据应持续写入文件。

Herdr 解决的是多会话的运行与可见性，独立 Review 解决的是结果可信度。把两者接起来，才是一套可以长期使用的多 Agent 工作台。
