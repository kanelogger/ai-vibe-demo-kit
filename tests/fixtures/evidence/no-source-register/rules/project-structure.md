---
description: 项目结构与上下文边界
alwaysApply: false
---

# Project Structure

- 套件不规定应用目录和技术栈，以 `SPECS/ARCHITECTURE.md` 登记的事实为准。
- `AGENTS.md` 只做索引和高频红线，细则按主题放入 `rules/`。
- `workflow/` 保存本轮过程，`SPECS/` 保存长期事实，禁止互相替代。
- feature spec 统一放在 `SPECS/FEATURES/<feature-slug>/`。
- 简单决定放 `memory/decisions.md`，重要架构选择放 `memory/adr/`。
- 不为适配套件而重排既有应用代码；发现新模块时更新架构地图。
