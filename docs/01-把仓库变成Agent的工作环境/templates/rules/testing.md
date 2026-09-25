# Testing Rules

## Required Checks

- 每个改变可观察行为的功能或修复必须在同一 commit 新增或更新自动化测试；`feat`、`fix` 由 `source/tools/check-change-tests.mjs` 强制检查。
- implementation Stage 必须提交 `test-impact/v1`。`behavioral` 记录源码、测试和实际通过的检查；`non-behavioral` 明确记录无需修改测试的原因。

| Change type | Required verification |
| --- | --- |
| 核心逻辑或状态转换 | `node --test test/runtime/control.test.mjs test/runtime/store.test.mjs` |
| 模块与真实依赖协作 | `node --test test/runtime/cli.test.mjs test/distribution/lifecycle.test.mjs` |
| 共享接口或 Schema | `node --test test/runtime/validator.test.mjs`、`./harness check --json` |
| 关键用户路径 | `node --test test/runtime/*.test.mjs test/distribution/*.test.mjs` |
| UI 与体验 | 当前 Harness 无 UI；新增 UI 时必须补充真实浏览器路径和截图证据。 |

## 测试策略与先后顺序

- 强烈优先以 E2E 作为唯一的自动化测试机制，用真实用户路径验证复杂功能；只有 E2E 无法有效覆盖或仓库门禁明确要求时，才使用孤立测试。上表已明确要求的检查不能跳过。
- 不在编写本次改动的实现代码后补写对应的单元测试。确需孤立测试时，先逐项写下已识别的失败方式与边界条件，再编写测试和相应实现；无法穷尽所有失败方式时，说明剩余风险。这不禁止为已有代码在下一次改动前先写回归测试。若本次实现已先行而门禁又要求新增单元测试，只能在不影响已有或并发改动的前提下撤回本次对应实现，按上述顺序重做；否则停止并报告阻塞，不事后补测。

## E2E 执行时机与证据

- 启用这套规则时，先在目标项目的 `project.yml#commands.e2e`（或测试文档）登记并核实全套 E2E 命令，在测试文档说明如何只运行相关场景。`node --test` 或文件名本身不证明某项检查是 E2E；不要把上表命令冒充全套 E2E。若上表某命令经核实就是全套 E2E，也须留到收尾执行。没有可运行入口时，不能声称完成了全套 E2E。
- 有适用 E2E 的实现任务，开发期间只运行与改动相关的针对性 E2E，不运行全套；实现完成、准备交付时在最终代码上运行全套 E2E。文档、配置等不改变可观察行为的任务仍按风险选择针对性检查，不因仓库有 E2E 就强制运行全套。
- 全套 E2E 后若修改了会影响结果的代码或测试，针对改动重测，并在最终版本上重跑全套；不得使用修改前的通过结果作为交付证据。尚无适用 E2E 或环境不可用时，记录原因与未覆盖的风险，不得声称已通过。
- 每次 E2E（包括针对性运行）结束后生成并保存可核验、可复现的工件：代码版本（提交哈希；有未提交改动时附相关 diff）、实际命令与工作目录、退出码、结果报告或日志、必要的环境和依赖版本、固定测试数据或初始化/重置方式；使用随机性时记录 seed，有 UI 时附截图。给出工件位置和复现步骤，避免纳入敏感信息。

## 性能与结构审查

- 功能验收通过后，对已稳定或历史复杂的模块可先做性能/结构审查，再进入下一需求；
  前提是已有可运行版本和真实数据作参照，不得在静态设计稿上判断。
- 边界明确但历史复杂的模块：先新增并行实现，对比新旧结果，验证通过后替换旧路径；
  替换完成必须删除旧路径，两套实现不得永久共存（见 git.md）。
- 审查结论与替换验证记录进 verification-report 或独立 review 记录，供下一需求决策。

## Reporting

- 记录实际运行的命令、结果和关键输出。
- `skipped` 必须说明原因和风险。
- 测试产生的数据、账户、文件和进程必须清理。
- 测试存在不等于功能可用；关键路径必须真实运行。
- Acceptance 报告使用 `verification-report/v1`；Stage Result 条件状态必须与报告一致。
- `passed` 检查记录实际命令、退出码和 Evidence；`skipped`、`failed` 与残留资源记录原因并形成 Policy Failure。
