# Lifecycle Hooks

Hook 只处理横切约束：权限检查、格式检查、状态记录、审计和人工批准。需求分析、实现、测试与发布计划属于 Workflow stage。

每个 Hook 引用必须声明：

- 触发事件，例如 `before_stage`、`after_stage`、`before_external_write`。
- 执行方式，例如确定性脚本、Skill 或人工批准。
- 所需权限与副作用。
- 失败策略；质量与安全 Hook 默认 `block`。
- 写入当前需求的证据位置。

第一版不要允许 YAML 内嵌任意 Shell。脚本使用仓库内固定路径并经过 review，外部写入必须人工批准。

## 代码架构索引检查

`check_architecture.py` 读取 `project.yml#architecture_memory`，只扫描配置的代码根目录。它检查每个代码目录都有架构索引，并且直接父模块已登记所有子模块。`.agents/`、`SPECS/`、`rules/` 等治理目录只有被显式配置为代码根目录时才会被扫描。

默认检查器只依赖 Python 3.9+ 标准库。没有 Python 的目标项目必须提供等价检查器，并同步替换 `project.yml#commands.architecture_check`。
