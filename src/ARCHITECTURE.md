# Production Source Architecture

## Responsibility

聚合 Runtime、Distribution 与 Shared 三个生产 Module，并保持由 Adapter 指向领域 Interface 的单向依赖。

## Module Index

| Module | Architecture | Public Interface |
| --- | --- | --- |
| `runtime/` | `runtime/ARCHITECTURE.md` | `runRuntimeCommand`、Validator facade |
| `distribution/` | `distribution/ARCHITECTURE.md` | `runDistributionCommand`、Manifest loader、status mapping |
| `shared/` | `shared/ARCHITECTURE.md` | Errors、PathSafety、RepositoryGuard、Manifest |

## Dependency Direction

Runtime 与 Distribution 可以依赖 Shared；Distribution Doctor 可以读取 Runtime readiness facade。Shared 不反向依赖 Runtime、Distribution 或 CLI。
