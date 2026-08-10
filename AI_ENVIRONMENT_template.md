# AI Environment Manifest

> 使用方式：将本文件复制为 `AI_ENVIRONMENT.md`，删除本说明，并填写全部花括号占位符。未知事实写 `unknown` 并注明负责人和确认方式；不适用项写 `not-applicable` 和原因。禁止写入密钥、令牌、客户数据、设备序列号或个人隐私。

## 00. Contract Metadata

| Field | Value |
| --- | --- |
| Schema version | `1` |
| Manifest owner | {填写：维护团队或角色} |
| Project reference | `project.yml` |
| Source of truth | `AI_ENVIRONMENT.md` |
| Last verified at | {填写：ISO 8601 时间} |
| Verified by | {填写：人员、Agent 或 CI Job} |
| Refresh trigger | {填写：工具链升级、CI 镜像变化、权限变化等} |

### Discovery and precedence

Agent 必须先读取 `project.yml` 和本文件，再执行任务。发生冲突时按以下规则处理：

1. 项目要求、允许命令和权限以 `project.yml` 为准。
2. 机器实际状态以本文件记录的探测命令当前输出为准。
3. Agent 能力以当前会话实际暴露的 Skill、工具、Connector、权限和沙箱为准。
4. 有冲突或信息过期时停止推断，在 alignment Evidence 中记录偏差。

有效能力按以下关系判断：

```text
Effective Capability
= Project Requirement
∩ Machine Availability
∩ Agent Permission
```

## 01. Environment Profiles

| Profile | Purpose | Platform | Configuration source | Supported | Owner |
| --- | --- | --- | --- | --- | --- |
| local | {填写：本地开发用途} | {填写：OS/arch} | {填写：版本文件或配置路径} | {填写：yes/no} | {填写} |
| ci | {填写：CI 用途} | {填写：镜像/Runner} | {填写：Workflow 路径} | {填写：yes/no} | {填写} |
| release | {填写：发布用途或 not-applicable} | {填写} | {填写} | {填写} | {填写} |

## 02. Machine Environment

### Platform

| Fact | Probe command | Observed | Requirement source | Evidence source | Verified at | Status |
| --- | --- | --- | --- | --- | --- | --- |
| OS / kernel | `uname -srm` | {填写} | `project.yml#environment.supported_os` | {填写：Evidence 路径或命令输出记录} | {填写：ISO 8601 时间} | {填写：matched/deviation/unknown} |
| Architecture | `uname -m` | {填写} | `project.yml#environment.supported_architectures` | {填写} | {填写} | {填写} |
| Shell | {填写：如 `$SHELL --version`} | {填写} | {填写：项目要求或 not-applicable} | {填写} | {填写} | {填写} |
| Locale | {填写：安全的探测命令} | {填写} | {填写} | {填写} | {填写} | {填写} |
| Time zone | {填写：安全的探测命令} | {填写} | {填写} | {填写} | {填写} | {填写} |
| Filesystem case sensitivity | {填写：探测方式} | {填写} | {填写} | {填写} | {填写} | {填写} |

### Runtimes

| Runtime | Required version | Version source | Manager | Probe command | Resolved executable | Observed | Evidence source | Verified at | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Node.js | {填写} | {填写：如 `.nvmrc`、`package.json`} | {填写：Volta/nvm/none} | `node --version` | {填写：`command -v node` 输出} | {填写} | {填写} | {填写} | {填写} |
| Python | {填写或 not-applicable} | {填写} | {填写：pyenv/uv/none} | `python3 --version` | {填写} | {填写} | {填写} | {填写} | {填写} |
| Java | {填写或 not-applicable} | {填写} | {填写：jenv/SDKMAN/none} | `java -version` | {填写} | {填写} | {填写} | {填写} | {填写} |
| Rust | {填写或 not-applicable} | {填写} | {填写：rustup/none} | `rustc --version` | {填写} | {填写} | {填写} | {填写} | {填写} |

### Version managers

| Tool | Purpose | Configuration source | Probe command | Observed | Evidence source | Verified at | Activation requirement |
| --- | --- | --- | --- | --- | --- | --- | --- |
| {填写：Volta/pyenv/jenv/yrm/...} | {填写} | {填写} | {填写} | {填写} | {填写} | {填写} | {填写：Shell 初始化或 not-applicable} |

### Package managers and registries

| Tool | Required version | Version source | Probe command | Registry/mirror source | Network requirement | Evidence source | Verified at | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| {填写：brew/pnpm/uv/cargo/...} | {填写} | {填写} | {填写} | {填写：只写配置来源，不写凭据} | {填写} | {填写} | {填写} | {填写} |

### CLI tools

只登记项目需要或 Agent 可以实际调用的 CLI。

| CLI | Purpose | Required | Probe command | Resolved executable | Observed version | Evidence source | Verified at | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| git | {填写} | {填写：yes/no} | `git --version` | {填写} | {填写} | {填写} | {填写} | {填写} |
| gh | {填写或 not-applicable} | {填写} | `gh --version` | {填写} | {填写} | {填写} | {填写} | {填写} |
| rg | {填写或 not-applicable} | {填写} | `rg --version` | {填写} | {填写} | {填写} | {填写} | {填写} |
| jq | {填写或 not-applicable} | {填写} | `jq --version` | {填写} | {填写} | {填写} | {填写} | {填写} |
| curl | {填写或 not-applicable} | {填写} | `curl --version` | {填写} | {填写} | {填写} | {填写} | {填写} |
| {填写：其他 CLI} | {填写} | {填写} | {填写} | {填写} | {填写} | {填写} | {填写} | {填写} |

### Development tools

| Tool | Purpose | Invocation | Headless/GUI | Required profile | Probe | Evidence source | Verified at | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| {填写：Docker/OrbStack/Xcode/VS Code/...} | {填写} | {填写：CLI、App 或 not-callable} | {填写} | {填写} | {填写} | {填写} | {填写} | {填写} |

### Browsers

| Browser | Version | Profile/session | Automation interface | Headless support | Probe | Evidence source | Verified at | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| {填写：Chrome/Safari/...} | {填写} | {填写：不得记录个人账户信息} | {填写：BrowserSkill/Playwright/manual/...} | {填写} | {填写} | {填写} | {填写} | {填写} |

## 03. Agent Tool Capabilities

状态必须使用下列精确词汇之一：`unknown`、`unavailable`、`installed`、`available`、`authenticated`、`authorized`、`healthy`、`blocked-by-policy`。只有 `healthy` 表示可直接用于任务。

| Capability | Provider / interface | Operations | Prerequisites | Availability probe | Auth / permission | Constraints | Verification | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Browser testing | {填写：BrowserSkill/Playwright/...} | {填写：navigate/inspect/click/type/screenshot/...} | {填写：浏览器、扩展、会话等} | {填写} | {填写} | {填写} | {填写：最小健康检查} | {填写} |
| GitHub | {填写：Connector/gh/...} | {填写} | {填写} | {填写} | {填写} | {填写} | {填写} | {填写} |
| Filesystem | {填写：Agent runtime} | {填写：read/write} | {填写} | {填写} | {填写：可读/可写根} | {填写} | {填写} | {填写} |
| Terminal | {填写：Agent runtime} | {填写：exec/process control} | {填写} | {填写} | {填写：沙箱/审批} | {填写} | {填写} | {填写} |
| {填写：Skill、Connector、MCP、App 或其他能力} | {填写} | {填写} | {填写} | {填写} | {填写} | {填写} | {填写} | {填写} |

## 04. Project Stack

| Layer / module | Technology | Required version | Version source | Entry point | Notes |
| --- | --- | --- | --- | --- | --- |
| {填写：frontend/backend/desktop/infra/...} | {填写：React/Tauri/Rust/...} | {填写} | {填写} | {填写} | {填写} |

## 05. Canonical Commands

`run` 引用 `project.yml#commands`，避免维护两份命令字符串。每个非 `not-applicable` 的命令都必须有对应执行契约。

### Command registry

| Command ID | Command reference | Purpose | Profiles | Contract completed |
| --- | --- | --- | --- | --- |
| install | `project.yml#commands.install` | {填写} | {填写} | {填写：yes/no/not-applicable} |
| develop | `project.yml#commands.develop` | {填写} | {填写} | {填写} |
| test | `project.yml#commands.test` | {填写} | {填写} | {填写} |
| typecheck | `project.yml#commands.typecheck` | {填写} | {填写} | {填写} |
| lint | `project.yml#commands.lint` | {填写} | {填写} | {填写} |
| build | `project.yml#commands.build` | {填写} | {填写} | {填写} |
| e2e | {填写：`project.yml` 引用或 not-applicable} | {填写} | {填写} | {填写} |
| browser-test | {填写：`project.yml` 引用或 not-applicable} | {填写} | {填写} | {填写} |
| {填写：其他命令 ID} | {填写} | {填写} | {填写} | {填写} |

### Command contract

为 registry 中每个适用命令复制并填写一份：

```yaml
command_id: "{填写：registry ID}"
command_ref: "{填写：project.yml#commands.<id>}"
run: "{填写：从 command_ref 解析的实际命令；必须与 project.yml 一致}"
purpose: "{填写：命令证明或产生什么}"
cwd: "{填写：仓库相对路径}"
profiles: ["{填写：local/ci/release}"]
requires:
  - "{填写：Runtime、服务或能力}"
inputs:
  - "{填写：参数、文件或 not-applicable}"
environment:
  - name: "{填写：变量名或 not-applicable；禁止填写值}"
    source: "{填写：example 文件、Secret Store 或人工注入}"
network: "{填写：none/required/optional，以及允许目标}"
approval: "{填写：none 或审批动作}"
side_effects:
  - "{填写：文件、进程、数据库或外部写入}"
timeout_seconds: "{填写：正整数}"
success_exit_codes: [0]
produces:
  - "{填写：Artifact 路径或状态}"
verify:
  - "{填写：成功后的可观察检查}"
cleanup:
  - "{填写：清理命令或 not-applicable + 原因}"
```

## 06. Services and Lifecycle

| Service | Purpose | Profiles | Depends on | Start command ref | Health check | Port/socket | Data location | Stop | Cleanup | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| {填写：database/redis/backend/...} | {填写} | {填写} | {填写} | {填写} | {填写} | {填写：避免未确认的固定端口} | {填写} | {填写} | {填写} | {填写} |

### Startup sequence

1. {填写：依赖检查和启动顺序}
2. {填写：就绪条件}

### Shutdown and cleanup sequence

1. {填写：停止顺序}
2. {填写：测试资源、临时文件和孤儿进程检查}

## 07. Network and Filesystem

| Concern | Declared requirement | Observed / effective state | Probe or evidence | Constraint |
| --- | --- | --- | --- | --- |
| Network access | {填写} | {填写} | {填写} | {填写：域名、代理、证书等} |
| Read roots | {填写} | {填写} | {填写} | {填写} |
| Write roots | `project.yml#permissions.write_roots` | {填写} | {填写} | {填写} |
| Sandbox | {填写} | {填写} | {填写} | {填写} |
| GUI/display | {填写} | {填写} | {填写} | {填写} |

## 08. Paths, Data and Artifacts

| Kind | Repository-relative path | Owner | Generated | Retention / cleanup | Notes |
| --- | --- | --- | --- | --- | --- |
| Source | {填写} | {填写} | no | retained | {填写} |
| Tests | {填写} | {填写} | no | retained | {填写} |
| Generated code | {填写或 not-applicable} | {填写} | yes | {填写} | {填写} |
| Build artifacts | {填写} | {填写} | yes | {填写} | {填写} |
| Test reports | {填写} | {填写} | yes | {填写} | {填写} |
| Screenshots / recordings | {填写或 not-applicable} | {填写} | yes | {填写} | {填写} |
| Temporary data | {填写} | {填写} | yes | {填写} | {填写} |

### Data lifecycle

- Database/schema source: {填写或 not-applicable}
- Migration command reference: {填写或 not-applicable}
- Seed/fixture strategy: {填写或 not-applicable}
- Persistent versus ephemeral data: {填写}
- Test isolation and cleanup proof: {填写}

## 09. Observability and Troubleshooting

| Signal | Location / command | Expected evidence | Sensitive-data rule | Owner |
| --- | --- | --- | --- | --- |
| Logs | {填写} | {填写} | {填写：脱敏规则} | {填写} |
| Debugging | {填写} | {填写} | {填写} | {填写} |
| Tracing/profiling | {填写或 not-applicable} | {填写} | {填写} | {填写} |

| Known failure signature | Diagnosis command | Likely cause | Safe fallback | Escalation owner |
| --- | --- | --- | --- | --- |
| {填写} | {填写} | {填写} | {填写} | {填写} |

## 10. Verification and Acceptance

| Verification level | Command reference | Required profile | Expected result | Evidence path | Cleanup evidence |
| --- | --- | --- | --- | --- | --- |
| Unit | {填写} | {填写} | {填写} | {填写} | {填写} |
| Integration | {填写或 not-applicable} | {填写} | {填写} | {填写} | {填写} |
| E2E | {填写或 not-applicable} | {填写} | {填写} | {填写} | {填写} |
| Browser/UI | {填写或 not-applicable} | {填写} | {填写} | {填写} | {填写} |
| Build | {填写} | {填写} | {填写} | {填写} | {填写} |
| Acceptance | {填写} | {填写} | {填写} | {填写：Stage Result/verification report} | {填写} |

允许声称完成的条件：{填写：通过项、不可跳过项、Human Gate 和残留风险报告要求}。

## 11. Constraints and Approval Policy

按来源分开记录，便于确定修复责任。

| Source | Forbidden or constrained operation | Reason | Approval owner | Safe alternative | Verification |
| --- | --- | --- | --- | --- | --- |
| Machine | {填写或 not-applicable} | {填写} | {填写} | {填写} | {填写} |
| Agent runtime | {填写：沙箱、网络、GUI 等} | {填写} | {填写} | {填写} | {填写} |
| Project policy | `project.yml#permissions` | {填写} | {填写} | {填写} | {填写} |
| External system | {填写：生产、发布、第三方写入等} | {填写} | {填写} | {填写} | {填写} |

## 12. Secrets and Sensitive Data

只登记变量名、来源和验证方式，不登记实际值。

| Name | Required | Profiles | Secret source | Scope | Safe presence check | Redaction rule | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| {填写：环境变量名或 not-applicable} | {填写} | {填写} | {填写：Secret Store/人工注入} | {填写} | {填写：不得输出值} | {填写} | {填写} |

## 13. CI Parity

| Concern | Local | CI | Release | Accepted difference | Evidence |
| --- | --- | --- | --- | --- | --- |
| OS / architecture | {填写} | {填写} | {填写} | {填写} | {填写} |
| Runtime versions | {填写} | {填写} | {填写} | {填写} | {填写} |
| Services | {填写} | {填写} | {填写} | {填写} | {填写} |
| Commands | {填写} | {填写} | {填写} | {填写} | {填写} |
| Permissions/network | {填写} | {填写} | {填写} | {填写} | {填写} |

## 14. Known Issues and Freshness

| Issue / stale fact | Impact | Workaround | Owner | Recheck trigger | Status |
| --- | --- | --- | --- | --- | --- |
| {填写或 none} | {填写} | {填写} | {填写} | {填写} | {填写} |

## 15. Alignment Checklist

- [ ] `AI_ENVIRONMENT_template.md` 已提升为 `AI_ENVIRONMENT.md`。
- [ ] 全部花括号占位符已替换，未知项包含负责人和确认方式。
- [ ] `project.yml` 与本文件之间没有未解释的冲突。
- [ ] 必需机器探测已执行，实际值、路径、时间和偏差已记录。
- [ ] 必需 Agent 能力已验证为 `healthy`；其余状态没有被当作可用能力。
- [ ] 每个适用命令都有执行契约、成功证据和清理策略。
- [ ] 服务健康检查、停止和清理路径可执行。
- [ ] Secrets 章节没有实际密钥或敏感值。
- [ ] local、CI、release 的差异已记录。
- [ ] alignment Evidence 引用了本文件当前版本和实际探测输出。
