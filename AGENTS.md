# AGENTS.md

## 项目地图

- 项目身份、环境探测和命令：`project.yml`
- 架构总览与依赖方向：`ARCHITECTURE.md`
- Source 分发清单：`source/manifest.json`
- 默认 Skill 远程来源：`source/.agents/skills.sources.json`
- 外部 Skill 锁定：`source/.agents/skills.lock.json`
- 长期知识入口：`source/knowledge/INDEX.md`
- 知识渐进加载：`source/knowledge/ROUTING.md`
- Workflow 与 Evidence 契约：`source/workflows/`
- 当前任务与 Gate：`./harness status --json`
- 测试、安全和 Git 规则：`source/rules/`

## 开始前

1. 读取 `project.yml` 和 `ARCHITECTURE.md`。
2. 运行 `project.yml#environment.probes` 中的必需探测；把实际值和偏差写入当前需求的 alignment Evidence。
3. 运行 `./harness check --json` 和 `./harness status --json`，确认 Workflow、Revision、允许动作和 Pending Gate。
4. 按 `source/knowledge/ROUTING.md` 读取最小知识集合，再读取相关 Module 的 `ARCHITECTURE.md`、代码入口和邻近测试。
5. 检查工作区已有改动并保留不属于当前需求的内容。

环境探测不满足 `project.yml` 声明时，将 `environment-confirmed` 报告为 `failed` 并停止推进；不得自行假定兼容。

## 代码架构记忆

`project.yml#architecture_memory.code_roots` 是代码 Module 范围的唯一来源。在这些根目录内：

1. 修改前读取目标 Module 及父 Module 的 `ARCHITECTURE.md`。
2. 新建、移动或删除文件夹时，同步维护该目录及父目录的 Module 索引。
3. Interface、Invariant、依赖方向或验证方式变化时，在同一变更中刷新架构文档。
4. `exclude` 中的测试、夹具和生成目录不要求独立架构索引。

## 高风险边界

- 不擅自发布、推送、改写 Git 历史或修改生产系统。
- 不把密钥、客户数据或未脱敏线上数据写入 Prompt、日志、Stage Result 或 Evidence。
- Harness 不执行报告中声明的命令，也不自动删除测试资源；Agent 或 CI 执行操作后提交可验证 Evidence。
- 不覆盖目标仓库已有的治理文件；Distribution Lifecycle 冲突必须人工审查。

## 验证

- ControlKernel 或 FileStore：运行对应状态与存储测试。
- Validator、Workflow 或 contract：运行 validator 测试和 `./harness check --json`。
- CLI、Lifecycle 或公共行为：运行 CLI/Lifecycle 测试。
- 关键路径或发布候选：运行 `node --test test/runtime/*.test.mjs test/distribution/*.test.mjs`。
- 完成证据：运行 `./harness check-result --workflow source/workflows/workflow-template.json --stage acceptance --file <acceptance-result.json> --require-complete --json`。

实际命令、退出码、关键输出、跳过项、测试资源清理和残留风险必须进入 `verification-report/v1`。失败与环境限制必须显式报告。

## 完成条件

1. 需求范围已实现，相关架构和知识索引已同步。
2. 必需测试通过，测试产生的数据、文件和进程已清理或被明确标记为 Policy Failure。
3. acceptance Stage Result 和 verification report 通过无状态完成检查。
4. 通过 `./harness signal` 提交当前 Stage Result；最终 Human Gate 未批准前不得声称交付完成。
