// table-fixtures.test.mjs — 表驱动 fixtures 入口（NFR-10）。
// 用例表是唯一声明；fixture 运行器逐行在隔离临时仓库重放并断言。

import { runCases } from "./fixture-runner.mjs";
import { transitionCases } from "./cases/transition-cases.mjs";
import { riskCases } from "./cases/risk-cases.mjs";
import { featureFastPathCases } from "./cases/feature-fast-path-cases.mjs";
import { bugfixFastPathCases } from "./cases/bugfix-fast-path-cases.mjs";
import { maintenanceFastPathCases } from "./cases/maintenance-fast-path-cases.mjs";
import { rollbackCases } from "./cases/rollback-cases.mjs";
import { sliceCases } from "./cases/slice-cases.mjs";

runCases("转换表", transitionCases);
runCases("风险画像", riskCases);
runCases("low Feature 快路径", featureFastPathCases);
runCases("low Bugfix 快路径", bugfixFastPathCases);
runCases("low Maintenance 快路径", maintenanceFastPathCases);
runCases("Rollback", rollbackCases);
runCases("Slice 模型", sliceCases);
