# 01 — 统一 `harness` CLI façade 与表驱动 fixture 运行器

**What to build:** 开发者与测试只通过一个 `harness` 入口完成 Phase B 所需的全部状态操作（status/start/confirm/advance/close/rollback），平台 Adapter、手工模式与 fixtures 调用同一 API、同一 JSON schema、同一退出码与错误码（FR-H01）。同时交付表驱动 fixture 运行器：每个生命周期转换或错误码以声明式表格描述"允许 / 拒绝 / 修复后通过"三类用例（NFR-10），运行器在临时 Git 仓库（含 stateRef）中重放命令序列并断言状态、审计与输出契约。后续所有生命周期 ticket 的 fixtures 都建立在该运行器之上，不各自另造测试脚手架。

**Blocked by:** None — 可立即开始（外部前置：Phase A 的 stateRef、Project Registry、Work Item namespace 已可用）。

**Status:** done

- [x] 单一 `harness` 入口派发 status/start/confirm/advance/close/rollback，不存在第二套公共入口
- [x] 每个子命令支持稳定 JSON 输出、文档化退出码与错误码；Adapter、手工、fixture 三种调用方式结果一致
- [x] `harness status` 输出 active/idle、当前允许与禁止动作、下一条可执行命令，且不修改任何仓库事实（FR-H02）
- [x] fixture 运行器接受声明式转换表（初始状态 → 命令序列 → 期望允许/拒绝 → 修复动作 → 期望通过），逐行执行并给出可读 diff
- [x] 每次拒绝包含稳定错误码、事实位置、原因与一条首选修复命令（NFR-03）
- [x] fixture 在隔离临时仓库运行，全程离线、不调用模型（NFR-01），套件可重复执行且结果确定
