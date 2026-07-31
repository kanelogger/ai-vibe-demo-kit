# ai-vibe-demo-kit

为现有代码库安装 AI 原生研发系统的 vibe coding 套件。

它不生成前端、后端、数据库或业务模块，也不改变现有项目结构。应用代码先由你选择的模板或现有仓库提供，Kit 再覆盖上下文、规格、状态、门禁、Skills 和反馈回路。

## 安装后的能力

- `AGENTS.md`：冷启动索引、高频规则和阶段门禁。
- `workflow-state.json` + `workflow/`：带用户原话证据的需求与方案流转。
- `SPECS/`：长期有效的架构、行为契约和 feature spec。
- `tasks/`：从确认规格派生的执行单元。
- `memory/`：决策、覆盖谱系和 ADR。
- `rules/`：实现、测试、安全和 Git 规则分片。
- `.agents/`：Skills、Hooks 和阶段路由。
- `scripts/kit.mjs`：可在项目内运行的状态机与确定性检查。

## 使用

先创建或准备应用项目：

```sh
your-template-installer my-project
cd my-project
```

再安装 vibe coding 层：

```sh
npx ai-vibe-demo-kit init .
node scripts/kit.mjs check
node scripts/kit.mjs next
```

默认不会覆盖已有控制文件。确实要重装时，先审查冲突范围，再显式运行：

```sh
npx ai-vibe-demo-kit init . --force true
```

安装后先根据仓库证据填写 `SPECS/ARCHITECTURE.md`，登记真实技术栈、模块位置、运行、构建、测试、关键用户路径和恢复命令。

## 工作流

```text
initialized
-> requirements-draft
-> requirements-confirmed
-> solution-options
-> solution-selected
-> implementation-ready
```

常用命令：

```sh
node scripts/kit.mjs propose --title "Feature Name"
node scripts/kit.mjs stage advance requirements-draft --by user --quote "<用户原话>"
node scripts/kit.mjs stage advance requirements-confirmed --by user --quote "<用户原话>"
node scripts/kit.mjs options --ids minimal,balanced,robust
node scripts/kit.mjs options --check
node scripts/kit.mjs stage advance solution-options --by user --quote "<用户原话>"
node scripts/kit.mjs stage advance solution-selected --by user --quote "<用户原话>"
node scripts/kit.mjs sdd user-import
node scripts/kit.mjs stage advance implementation-ready --by user --quote "<用户原话>"
```

`kit options` 只创建三个方案骨架，不替用户选择。`kit sdd` 创建技术栈无关的 `SPECS/FEATURES/<feature-slug>/spec.md` 和 `tasks.md`。

## 设计原则

Kit 同时建立两个闭环：

1. 上下文闭环：仓库保存事实、过程、状态和经验，新会话可以恢复工作环境。
2. 执行闭环：需求形成可观察目标，功能拆成可运行小版本，通过门禁、真实验证、清理和回退控制风险。

判断安装是否有效，可以让一个没有口头背景的新会话只读仓库并回答六个问题：项目是什么、当前走到哪、允许做什么、按什么流程做、如何验证、经验写到哪里。

## 开发与发布

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
npm pack --dry-run
```

发布包只包含 CLI、通用 Overlay、Skills、Hooks 和说明文件，不包含应用源码。

## 要求

- Node.js `^20.19.0 || >=22.13.0`
- pnpm `>=9`
