---
title: 从“没人知道自己要什么”到可运行代码：七阶段 Skill 流水线
slug: seven-stage-skill-pipeline
summary: 从四类失败模式出发，用 Skill 把工程对话推进到可运行代码。
description: 沟通鸿沟、缺少共享语言、反馈回路缺失、软件熵增——这四类失败模式决定了 Agent 工程能否落地。文章给出对应 Slash Command 修复方案，以及 GRILL → RESEARCH → PROTOTYPE → PRD → ISSUES → IMPLEMENT → REVIEW 七阶段流水线。
---

## A. 真正想解决的四类失败模式

// 4 FAILURE MODES → 4 FIXES

### 1. FAILURE · 沟通鸿沟 ⭐ 最受欢迎

**Agent 没做对你想要的事** `communication gap`

> “没人确切知道自己想要什么。” — *The Pragmatic Programmer*

**修复** · 在动工前先被 Agent 反向拷问。\
`/grill-me` `/grill-with-docs`

***

### 2. FAILURE · 缺少共享语言 ⭐ 最酷的技术

**Agent 太啰嗦** `no shared language`

> DDD · Eric Evans：领域专家与开发者一开始说的就不是同一种语言，Agent 也一样。

**修复** · `CONTEXT.md` 领域词典 + `docs/adr/` 决策记录 → 命名一致 · 代码可导航 · token 更少\
`CONTEXT.md` `docs/adr/`

***

### 3. FAILURE · 反馈回路缺失

**代码跑不通** `missing feedback loop`\
⚙ 反馈速率 = 速度上限

> Pragmatic Programmer：反馈速率就是你的速度上限。

**修复** · 把静态类型 / 浏览器 / 自动化测试的反馈接回来 — 强制 vertical slice，一次一个 tracer bullet\
`/tdd` `/diagnose`

***

### 4. FAILURE · 软件熵增

**系统变成屎山** `entropy ↑↑↑`\
🔥 周期性救火

> Kent Beck · Ousterhout：每天投资设计；深模块 — 窄接口、厚实现优先。

**修复** · 写 PRD 前先问范围 · 强制把局部放回全景 · 每隔几天对代码库跑一次救火\
`/to-prd` `/zoom-out` `/improve-codebase-architecture`

***

## B. Skill 清单 · 三类 Slash Commands

// ENGINEERING · PRODUCTIVITY · MISC

### Engineering 日常代码工作 — 9 SKILLS

| Command                          | 说明                 | 对应阶段               |
| -------------------------------- | ------------------ | ------------------ |
| `/grill-with-docs`               | 动工前的工程版逼问          | GRILL              |
| `/tdd`                           | red→green→refactor | IMPLEMENT          |
| `/diagnose`                      | 复现→最小化→假设→修        | IMPLEMENT / REVIEW |
| `/to-prd`                        | 从对话到 PRD           | PRD                |
| `/to-issues`                     | PRD→工单             | ISSUES             |
| `/triage`                        | 优先级分类              | ISSUES             |
| `/improve-codebase-architecture` | 周期性救火              | REVIEW             |
| `/zoom-out`                      | 局部→系统全景            | 任意阶段               |
| `/setup-matt-pocock-skills`      | 一键安装               | —                  |

### Productivity 通用工作流 — 3 SKILLS

| Command          | 说明                  | 对应阶段  |
| ---------------- | ------------------- | ----- |
| `/grill-me`      | 通用版逼问               | GRILL |
| `/caveman`       | 极简通信 · 省\~75% token | 任意阶段  |
| `/write-a-skill` | 写一个 Skill           | —     |

### Misc 不常用工具 — 4 SKILLS

| Command                       |
| ----------------------------- |
| `/git-guardrails-claude-code` |
| `/migrate-to-shoehorn`        |
| `/scaffold-exercises`         |
| `/setup-pre-commit`           |

***

## C. 从对话到落地的七阶段流水线

// NOT ISOLATED — A PIPELINE

从模糊想法到可运行代码的完整闭环：

> **GRILL → RESEARCH → PROTOTYPE → PRD → ISSUES → IMPLEMENT → REVIEW**

|        阶段        | 核心动作           | 关键产出          | 对应 Skill                                     |
| :--------------: | :------------- | :------------ | :------------------------------------------- |
|   **1. GRILL**   | 把模糊想法变成共享理解    | 问题陈述 + 对齐     | `/grill-me` `/grill-with-docs`               |
|  **2. RESEARCH** | 缓存难探索的外部信息     | `research.md` | —                                            |
| **3. PROTOTYPE** | 用可玩代码验证设计 / UX | 可丢弃原型         | `/tdd`（可选）                                   |
|    **4. PRD**    | 描述终点，而非路径      | 需求文档          | `/to-prd`                                    |
|   **5. ISSUES**  | 拆成可并行执行的垂直切片   | 带依赖的工单 DAG    | `/to-issues` `/triage`                       |
| **6. IMPLEMENT** | Agent 执行       | 可运行代码         | `/tdd` `/diagnose`                           |
|   **7. REVIEW**  | 人工 QA，发现问题再回环  | QA 计划 + 新工单   | `/diagnose` `/improve-codebase-architecture` |

### 核心原则

* **先对齐再构建** — 动工前用 Grill 把模糊需求变成共享理解。
* **终点先于路径** — PRD 描述“到哪去”，Issues 描述“怎么切”，实现阶段只负责跑通。
* **原型可丢弃** — Prototype 阶段的目标是快速验证，不是写出可维护代码。
* **Review 闭环回 Issues** — QA 发现的每个问题都变成新工单，而不是口头修完就算。

### `/grill-with-docs` vs `/grill-me`

| `/grill-with-docs` | `/grill-me`   |
| ------------------ | ------------- |
| 有代码库               | 无代码库          |
| 对照代码库发现矛盾          | 纯产品构思 / 悼词式追问 |

### GRILL 额外能力 · 三类工件

#### CONTEXT.md · 领域语言

来自 DDD 的 ubiquitous language。它只是一份**术语表**，不是 spec、不是实现笔记。

> 例：用「materialization cascade」比冗长描述省 token、可搜索、命名一致。

#### ADR · `docs/adr/`

三条件**同时满足**才写：

* 难逆转
* 无上下文会令人惊讶
* 存在真实 trade-off

#### 会话中四类动作

| 动作               | 说明             |
| ---------------- | -------------- |
| 对照 glossary 挑战用词 | 确保双方说的是同一个概念   |
| 用具体场景压测边界        | 把抽象需求落到真实 case |
| 对照代码发现矛盾         | 在工程语境里修正假设     |
| 决策即时写入 CONTEXT   | 不批量攒，避免信息丢失    |
