# Agent 工作环境模板包

本目录是可复制到目标项目的运行时资源包。`templates/agents.md/` 只保存说明、案例和起草模板；本目录保存生成项目需要的按需环境资料和维护 Skill。

## 复制映射

将本目录内容复制到目标仓库根目录后，路径保持不变：

| 模板包路径 | 目标项目路径 | 用途 |
| --- | --- | --- |
| `docs/agent-environment/` | `docs/agent-environment/` | 按任务加载的环境资料 |
| `.agents/skills/agents-maintenance/` | `.agents/skills/agents-maintenance/` | AGENTS 规则维护 Skill |

模板入口文件仍位于 `templates/agents.md/`：

- `ai_environment_template.md` 复制为目标项目根目录的 `AI_ENVIRONMENT.md`；
- `project-template.yml` 复制为目标项目根目录的 `project.yml`；
- `skills.sources.json` 复制为目标项目的 `.agents/skills.sources.json`。

复制后，按目标项目实际情况填写配置，并删除不适用的模板说明。不要把模板包路径写入生成文件；生成文件只使用上表中的目标项目路径。
