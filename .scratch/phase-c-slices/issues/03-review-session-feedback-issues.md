# 03 — Review Session 与反馈 issues

**What to build:** Developer 实际使用 runnable Slice 的实测记录（PRD 9.6）。`harness review` 生成 Review Session 表单：当前可运行内容摘要、目标用户路径与启动方法、建议操作步骤、Developer 实际观察、附件或 digest、disposition（approved | changes-requested）与零个或多个 issues。human-reviewed 只表示当前 Review Session disposition=approved（FR-S04）；changes-requested 不进入 human-reviewed，直接进入 issue/reopen 路径。Issue 带五类 origin（requirements / design / specification / diagnosis / implementation），一次 Review 可多个 issue，全部保留并分别关闭（FR-S05、场景 7）。Human Review 绑定实测内容的 digest：任何事实或代码变化都使当前 Review 失效，修复后必须重新 Quick → runnable → 重新实测，不能用测试日志代替（§9.6）。Developer 不手工编辑证据文件。本次 Review Session 是 low 快路径的第二次阻塞式人工停顿，计入停顿预算（NFR-13）。

**Blocked by:** 02 — Quick 绑定与 runnable

**Status:** ready-for-agent

- [ ] fixture：approved Review Session 后 Slice 进入 human-reviewed，且 Review 绑定当前 content digest（FR-S03/S04）
- [ ] fixture：changes-requested 不进入 human-reviewed；多 issue 按五类 origin 分别记录与关闭（FR-S05、场景 7）
- [ ] fixture：Review 后代码或事实变化使当前 Human Review 失效，必须重新 Quick 与重新实测才能再推进（§9.6）
- [ ] fixture：diagnosis origin 仅在 Bugfix 类型接受；其他类型记录 diagnosis origin 被拒绝（§9.6）
- [ ] fixture：low 快路径中 Review Session 使人工停顿计数 +1（Brief 确认、实测、最终验收三次预算口径，NFR-13）
- [ ] Review Session 由 CLI 表单/结构化输入生成，Developer 不直接编辑 stateRef 证据文件（FR-S03）
