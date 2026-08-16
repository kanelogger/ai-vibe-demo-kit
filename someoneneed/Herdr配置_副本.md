# Herdr配置完成

当前机器状态：

- Herdr 版本为 `0.8.0`，使用 `stable` 通道。
- 客户端与后台服务器均在运行，协议版本兼容。
- 你已经位于 Herdr 内：工作区为 `kane_echoes`，标签页为 `w1:t1`，窗格为 `w1:p1`。
- Herdr 已在侧边栏中检测到 OMP。
- OMP 集成已安装，状态为 `current (v8)`。
  - 文件：`~/.omp/agent/extensions/herdr-omp-agent-state.ts`
  - 该集成提供权威的生命周期状态与 OMP 原生会话恢复能力。
  - 当前 OMP 进程启动于集成安装之前；此后新启动的 OMP 进程将加载该集成。
- `herdr` 智能体技能已经安装并在全局启用。
  - 入口：`~/.agents/skills/herdr`
  - 健康状态：`healthy`
- `~/.config/herdr/config.toml` 当前不存在。这是正常状态，Herdr 正在使用默认配置。
- 项目文件未被修改。

窗格控制也已通过冒烟测试：创建一个临时右侧分屏，在其中运行命令并读取到 `Herdr split verified`，随后关闭该窗格，确认原始布局已恢复。

- https://github.com/herdrdev/herdr
  - Help me understand and set up Herdr. Read https://herdr.dev/agent-guide.md first, then walk me through it step by step.
  - 阅读 `herdr --skill` 然后分割出另外10个面板，让我的电脑看起来像电影里那些科幻黑客终端
  - 安装对应集成可提升检测效果 herdr integration install claude https://herdr.dev/zh-cn/docs/integrations/
  - https://herdr.dev/zh-cn/docs/agent-skill/
  - 退出 ctrl+b q
  - herdr server stop
  - 多agent互相沟通 use the herdr cli / use herdr cli to talk to codex


## 心智模型

请按以下顺序理解 Herdr：

1. **会话（Session）**——持久运行的后台服务器。当前使用默认会话。
2. **工作区（Workspace）**——项目级容器，通常对应一个代码仓库或一项独立调查与排查。
3. **标签页（Tab）**——工作区内的一套窗格布局，例如 `agent`、`server` 或 `logs`。
4. **窗格（Pane）**——真实的终端进程。客户端分离后，窗格仍会继续运行。
5. **智能体（Agent）**——Herdr 在窗格中识别出的 AI 编码智能体进程。
6. **操作模式（Modes）**
   - 终端模式：按键发送给当前聚焦的终端。
   - 前缀模式：按下 `Ctrl+B`，松开后再按一个 Herdr 操作键。
   - 导航模式：持续生效的导航界面。

智能体状态：

- `working`：正在处理任务
- `blocked`：等待批准或用户回答
- `done`：后台任务已经完成，但对应标签页尚未被查看
- `idle`：智能体可接收新输入，且对应标签页已经被查看
- `unknown`：已识别出智能体，但无法可靠判断其状态

## 步骤 1：先使用鼠标

Herdr 的交互以鼠标为优先：

- 单击工作区、标签页、窗格或智能体以聚焦。
- 通过右键菜单创建、分屏、重命名或关闭对象。
- 拖动分隔线调整窗格大小。
- 在终端中拖动选择文本即可复制。

无需预先配置任何快捷键。

## 步骤 2：掌握最少量的键盘操作

前缀键（`prefix`）表示一个按键序列：先按下 `Ctrl+B`，松开，再按操作键。

| 操作 | 按键 |
|---|---|
| 显示所有当前生效的快捷键 | `prefix+?` |
| 新建标签页 | `prefix+c` |
| 向右分屏 | `prefix+v` |
| 向下分屏 | `prefix+-`，即最后按 `-` 键 |
| 在窗格之间移动 | `prefix+h/j/k/l` |
| 工作区导航 | `prefix+w` |
| 缩放当前窗格 | `prefix+z` |
| 关闭当前窗格 | `prefix+x` |
| 分离客户端 | `prefix+q` |

以 `prefix+?` 显示的结果为准，因为它反映当前安装版本中实际生效的快捷键。

## 步骤 3：在窗格中启动智能体

在新窗格中正常启动 OMP：

```bash
omp
```

Herdr 应当自动检测该进程，并在侧边栏显示其生命周期状态。OMP 集成现已安装，因此新启动的 OMP 会话可以直接上报语义化状态与原生会话标识。

诊断命令：

```bash
herdr agent list
herdr integration status
herdr agent explain <agent-name-or-pane-id> --json
```

当前智能体已经成功被识别，但 `agent explain` 显示，这个已运行的进程仍在使用 Herdr 基于终端画面的屏幕检测回退机制。新启动的 OMP 进程会加载刚安装的集成。

## 步骤 4：分离客户端，但不中断工作

在 Herdr 界面中：

1. 按下 `Ctrl+B`。
2. 松开按键。
3. 按下 `q`。

也可以直接关闭外层终端窗口。Herdr 后台服务器中的窗格、智能体、开发服务器及其他进程仍会继续运行。

随后，在 Herdr 外部的普通终端中运行以下命令重新连接：

```bash
herdr
```

不要在当前 Herdr 窗格内直接运行不带参数的 `herdr`；Herdr 会主动阻止嵌套启动。

## 步骤 5：明确破坏性操作的边界

分离客户端会保留运行中的进程。以下命令会终止这些进程：

```bash
herdr server stop
```

`herdr server stop` 会停止 Herdr 服务器及其窗格进程。之后 Herdr 可以恢复布局，受支持的集成也可以恢复智能体对话，但普通运行命令、开发服务器及其他任意进程都已经终止。

## 步骤 6：故障诊断命令

```bash
herdr status
herdr status server
herdr status client
herdr agent list
herdr integration status
herdr agent explain <target> --json
```

默认会话的日志位置：

```text
~/.config/herdr/herdr.log
~/.config/herdr/herdr-client.log
~/.config/herdr/herdr-server.log
```

需要自定义时，配置文件位于：

```text
~/.config/herdr/config.toml
```

常用配置命令：

```bash
herdr --default-config
herdr server reload-config
```

建议先保留默认配置。立即完成一次 60 秒演练：用 `prefix+?` 打开快捷键帮助；用 `prefix+v` 创建右侧分屏；在新窗格中运行 `pwd`；用鼠标切换窗格；最后用 `prefix+q` 分离，再从普通终端运行 `herdr` 重新连接。

资料来源：[智能体指南](https://herdr.dev/agent-guide.md)、[核心概念](https://herdr.dev/docs/concepts/)、[键盘操作指南](https://herdr.dev/docs/keyboard/)、[集成说明](https://herdr.dev/docs/integrations/)、[会话持久化](https://herdr.dev/docs/session-state/)。


## 典型场景 Review

### Review 为什么有效

这个方法论源自一篇关于 LLM 自我纠正的论文《When Can LLMs Actually Correct Their Own Mistakes?》。这篇论文的结论是：如果没有可靠的外部反馈（测试结果、工具输出等），模型仅靠自己反思，很难稳定纠正错误。

换句话说，Review 的价值就在于有新增的上下文信息，比如新的方法论（应该怎么改）或者额外信息，让 Agent 获得新的注意力方向和额外计算预算。

### 四种 Review 提示

- 无信息 Review：“检查一下有没有问题。”
- 有方法 Review：“站在反方立场，尝试找出导致方案失败的条件。”
- 有风险先验 Review：“重点检查{并发、状态恢复、边界条件、测试污染}。”
- 有外部证据 Review：Requirements + diff + tests + lint + typecheck + logs + benchmark，让模型根据真实反馈判断。

### 核心模型

```text
Review Quality ≈
Reviewer Capability(GPT Sol xhigh) ×
Risk Prior(站在反方立场，尝试找出导致方案失败的条件。) ×
Verification Signal(tests / tools) ×
Independence(新会话 + 换模型)
```

### 我的操作 SOP

- 收到需求，Codex + GPT Sol xhigh 生成方案。
- 新开一个会话，对生成的方案进行 Review。
- omp + kimi3/ds 执行具体方案。
- 新开会话，用 omp + kimi3/ds 修复具体问题，一个 Bug 一个 Session。
