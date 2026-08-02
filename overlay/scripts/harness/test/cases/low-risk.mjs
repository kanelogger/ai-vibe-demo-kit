// low-risk.mjs — 快路径用例共享的 low 风险声明参数与 confirm 命令构造。
// 只共享输入参数；各用例文件的期望继续手写（独立真相源）。

export const LOW_RISK = [
  "--axes",
  "externalContract=low,dataReversibility=low,security=low,blastRadius=low,sharedContract=low,runtimeSwitch=low",
  "--allowlist",
  "singleSlice=true,localScope=true,noDataMigration=true,noSecurityChange=true,noContractBreak=true,reusesExistingPatterns=true,singleCommitRevert=true",
  "--triggers",
  "breaksPublicContract=false,changesSecuritySemantics=false,irreversibleData=false,touchesControlPlane=false,migrationCutover=false,crossesCoreModules=false",
];

export function confirmBrief(brief, quote) {
  return ["confirm", "--brief", JSON.stringify(brief), "--quote", quote, "--json"];
}
