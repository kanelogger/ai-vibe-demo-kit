# Runtime Validation Architecture

## Responsibility

提供 Runtime 唯一 Validator facade 背后的纯校验模块；负责 Workflow v2/v3、Stage Result、`execution-trace/v1`、Control State、环境清单与代码架构索引，不执行任务、Git 或外部写入。

## Interface

调用方只从父模块的 `validation/index.mjs` 导入 Validator。架构检查读取受控的 `project.yml#architecture_memory` YAML 子集，并返回稳定的 `valid`、`configurationValid`、`errors` 和 `warnings`。

## Invariants

- Contract 校验只读取仓库内普通文件，拒绝越界路径和 Symlink。
- 架构检查不修改索引，不自动推断缺失模块职责。
- Validator 内部文件不作为父模块之外的公共入口。

## Dependencies

| Dependency | Why | Evidence |
| --- | --- | --- |
| `../../shared/path-safety.mjs` | 仓库路径约束与 Symlink 检查 | `architecture.mjs`、`result.mjs`、`workflow.mjs` |

## Modules

当前模块没有直接子目录。

## Entry Points

| Purpose | Path or symbol |
| --- | --- |
| Validator facade | `index.mjs` |
| Architecture index | `architecture.mjs` |
| Control state | `control-state.mjs` |
| Environment manifest | `environment.mjs` |
| Stage Result and execution trace contracts | `result.mjs` |
| Workflow and Skill entities | `workflow.mjs` |

## Verification

```sh
node --test test/runtime/validator.test.mjs test/runtime/architecture.test.mjs
```

## Change Guide

新增 Contract 时先在对应内部模块实现并测试，再只通过 `index.mjs` 导出；新增公共命令时同步 Runtime CLI、Manifest capabilities 和安装投影。
