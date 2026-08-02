# 02 — Quick 绑定与 runnable

**What to build:** Slice 从 implementing 进入 runnable 的唯一条件是当前 revision 的 Quick 通过（PRD 9.1/16.1）。`harness verify quick` 实际执行 Slice 声明的验证命令，Quick 报告绑定：workItem/slice/revision、base integration commit、精确 change/content digest、config digest、contract/dependency digests、命令与结果、时间、environment-sensitive TTL（§9.5）。Quick 不以 HEAD 作为唯一内容身份：Quick 通过后内容、config 或声明的 contract/dependency 发生变化，Quick 立即 stale，Slice 不能推进也不能宣称 runnable（FR-S02、场景 10）；本地确定性结果不因时间单独过期，environment-sensitive check 独立 TTL 过期只重跑该 check（§7 原则 7、§16.4）。

**Blocked by:** 01 — Slice 模型：六态、DAG/frontier、Write Scope、revision

**Status:** done

- [x] fixture：implementing → runnable 必须有通过的 Quick 报告；无 Quick 或 Quick 失败被拒绝（FR-S01/S02）
- [x] fixture：Quick 报告完整记录 §9.5 全部绑定字段，digest 可对实际内容反查（NFR-12）
- [x] fixtures：Quick 后内容变化、config 变化、contract/dependency digest 变化分别使 Quick stale，runnable 不可保持（场景 10）
- [x] fixture：内容未变化时重复 verify quick 不因时间经过而失效（内容驱动失效，非 TTL）
- [x] fixture：声明了 environment-sensitive TTL 的 check 过期后只重跑该 check，其余结果保留（§16.4）
- [x] Quick 只覆盖当前 Slice 风险，不要求每个 Slice 运行 Work Item Full（FR-E01）
