# npm Publish Script Alignment

## Intent

在项目根目录新增 `publish-npm.sh`，为 `ai-vibe-demo-kit` 当前 `package.json` 版本提供可审计、需人工确认的 npm 公共发布流程。实现参考 SkillPort CLI 的发布保护，但不自动改版本、提交、打 Git tag 或 push。

## Implementation shape

- 使用零额外依赖的 Bash 脚本，定位脚本自身所在目录后执行。
- 校验 Node.js、npm 与 `project.yml` 发布环境一致；校验当前分支为 `main`、工作树干净且与 `origin/main` 同步。
- 从 `package.json` 读取包名和版本，检查 npm 登录状态及该版本尚未发布。
- 按 `project.yml#release.canonical_sequence` 运行 bundled Skill、Distribution、全量测试及 tarball dry-run 检查。
- 使用独立临时 npm cache，并通过 trap 清理。
- 默认要求用户精确输入 `publish`；仅显式 `--yes` 可跳过交互确认；`--dry-run` 只执行本地校验和发布 Gate，不写 npm registry。
- 发布后使用 `npm view <name>@<version>` 验证 registry 中的版本。

## Observable acceptance criteria

1. 项目根目录存在可执行的 `publish-npm.sh`，`bash -n publish-npm.sh` 通过。
2. `./publish-npm.sh --help` 清楚说明 `--dry-run`、`--yes` 与发布当前版本的行为。
3. `./publish-npm.sh --dry-run` 在当前干净、同步的 `main` 上完成 canonical pre-publish checks，且不调用 `npm publish`。
4. 脚本在错误分支、脏工作树、工具链不匹配、未登录或版本已发布时停止。
5. 正式路径只有在明确确认后才运行 `npm publish --access public`，随后以 `npm view` 校验精确版本。

## Environment evidence

| Probe | Observed | Expected | Result |
| --- | --- | --- | --- |
| `uname -s` | `Darwin` | macOS or Linux | passed |
| `uname -m` | `arm64` | arm64 or x86_64 | passed |
| `node --version` | `v24.18.0` | >=22; release 24.18.0 | passed |
| `git --version` | `2.55.0` | available | passed |
| `npm --version` | `11.16.0` | 11.16.0 | passed |
| `docker --version` | `29.4.0` | optional | passed |
| `./harness check --json` | valid, revision 48 idle | valid | passed |

## Risk and rollback

- npm publication不可覆盖或撤回为同版本重发，因此脚本在 registry 写入前执行本地 Gate、版本占用检查和人工确认。
- `--yes` 会跳过交互确认，但仍保留全部环境、Git、身份、版本与发布 Gate 检查。
- 实现本身只新增一个根目录脚本；回滚可删除该文件。验证不发布、不提交、不打 tag、不 push。
- registry 状态存在检查后变化的竞态；npm publish 的唯一版本约束仍会阻止覆盖，脚本会以非零状态失败。
