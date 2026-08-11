# Quick Evidence

1. 修复前：`node --test test/distribution/sync.test.mjs`，exit 1；新增断言在 `not-installed` 与 `newer` 分支观察到 `schemaVersion: undefined`。
2. 修复后：`node --test test/distribution/sync.test.mjs`，8 tests / 8 pass / 0 fail，exit 0。
3. 邻近回归：`node --test --test-reporter=spec test/distribution/lifecycle.test.mjs test/distribution/distribution-cli.test.mjs test/distribution/sync.test.mjs`，62 tests / 62 pass / 0 fail / 0 skipped，exit 0。
4. `git diff --check`，exit 0。

测试创建的临时仓库由现有测试 helper 管理；未启动长期后台进程，未执行网络、发布、Tag、Push 或生产写入。
