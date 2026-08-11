# <Module> Architecture

## Responsibility

{这个模块负责什么，以及明确不负责什么。}

## Interface

{调用者需要知道的入口、输入、输出、顺序约束、错误模式和性能特征。}

## Invariants

{无论实现如何变化都必须成立的约束。}

## Dependencies

| Dependency | Why | Evidence |
| --- | --- | --- |
| `<module>` | `<reason>` | `<path/test/doc>` |

## Modules

只登记直接子目录；目录名必须使用反引号和结尾斜杠，以便自动检查。

| Directory | Responsibility |
| --- | --- |
| `<child-module>/` | `<responsibility>` |

## Entry Points

| Purpose | Path or symbol |
| --- | --- |
| `<purpose>` | `<path>` |

## Verification

{修改后必须运行的测试、检查或真实用户路径。}

## Change Guide

{常见变更应该从哪里开始阅读，以及哪些位置需要同步更新。}

实现完成后直接刷新上述当前事实，不在本文件追加需求历史。需求级变更证据写入对应的 `architecture-impact.yml`。
