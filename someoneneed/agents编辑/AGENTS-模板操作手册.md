# AGENTS.md 模板简明操作手册

用户不需要逐项填写两个模板。把本手册中的提示词交给 Agent，由 Agent 读取现有规则、调查项目并生成两份完整草稿。

## 1. 文件位置

参考模板：

```text
/Users/{user}/project/{project}/inbox/article/技术/AGENTS-用户级模板.md
/Users/{user}/project/{project}/inbox/article/技术/AGENTS-项目级模板.md
```

最终文件：

```text
用户级：/Users/{user}/.codex/AGENTS.md
项目级：/Users/{user}/project/{project}/AGENTS.md
```

用户级文件的实际位置由 Agent 工具决定。以上用户级路径适用于当前 Codex 环境；项目级文件始终放在当前仓库根目录。

两个参考模板包含说明文字和代码块，不能直接复制为最终文件。Agent 必须填写模板、删除占位内容，并保留现有有效规则。

## 2. 使用步骤

### 第一步：启动新会话

从以下目录启动 Agent：

```text
/Users/{user}/project/{project}
```

不要先覆盖现有用户级 `AGENTS.md`。用户级文件影响所有项目，必须先审阅草稿。

### 第二步：发送填写提示词

复制并发送以下完整提示词：

```xml
<prompt>
  <context>
    需要根据两个参考模板，为当前用户和 {project} 仓库生成两份可直接使用的 AGENTS.md。
    用户级文件已经存在，属于跨项目配置，不能直接覆盖。
    项目级文件必须保持小而聚焦，只记录当前仓库的稳定全局信息。
  </context>

  <inputs>
    <user_template>/Users/{user}/project/{project}/inbox/article/技术/AGENTS-用户级模板.md</user_template>
    <project_template>/Users/{user}/project/{project}/inbox/article/技术/AGENTS-项目级模板.md</project_template>
    <existing_user_file>/Users/{user}/.codex/AGENTS.md</existing_user_file>
    <project_root>/Users/{user}/project/{project}</project_root>
    <project_file>/Users/{user}/project/{project}/AGENTS.md</project_file>
  </inputs>

  <task>
    读取两个模板和现有用户级文件，调查项目中可以可靠发现的事实。
    将现有规则分类，填写用户级和项目级模板，输出两份完整草稿。
    本轮只生成草稿和变更说明，不写入任何文件。
  </task>

  <workflow>
    <step>读取两个参考模板，确定用户级与项目级规则的边界。</step>
    <step>读取现有用户级 AGENTS.md 及其直接引用的规则文件；不要复制引用文件的全文。</step>
    <step>如果项目级 AGENTS.md 已存在，先读取并保留有依据的现有规则；再检查项目根目录、配置和约定，只提取稳定且无法可靠推导的项目事实。</step>
    <step>将现有规则归类为保留、重写、移动到项目级、下沉到文档或 Skill、删除。</step>
    <step>生成没有占位符、空章节和模板说明的用户级完整草稿。</step>
    <step>生成没有占位符、空章节和模板说明的项目级完整草稿。</step>
    <step>完成自检并输出结果；到此停止，不修改文件。</step>
  </workflow>

  <classification_rules>
    <user_level>只保留跨项目、长期稳定的个人偏好、质量标准、沟通方式、验证要求、安全边界和通用工具偏好。</user_level>
    <project_level>只保留项目定位、非标准命令、仓库级安全约束、稳定领域概念和必要的按需入口。</project_level>
    <scoped_rules>只适用于某个目录或包的规则不进入项目根文件。</scoped_rules>
    <skills>有明确触发条件的固定流程放入 Skill，不在 AGENTS.md 中展开流程全文。</skills>
    <discoverable_facts>可以从代码、配置、Schema 或目录检索得到的信息不写入 AGENTS.md。</discoverable_facts>
    <evidence>不要根据单次失败新增普通规则；安全和数据完整性规则除外。</evidence>
  </classification_rules>

  <constraints>
    <item>不得删除现有用户级文件中的独特偏好而不说明理由。</item>
    <item>保留仍然有效的外部规则引用，例如编码规则和 RTK 约定；不要复制引用文件全文。</item>
    <item>不得把 {project} 专属路径、命令和技术栈放入用户级文件。</item>
    <item>不得在项目级文件中重复用户级沟通偏好和工程原则。</item>
    <item>不得记录容易过时的具体模块、函数或文件位置。</item>
    <item>没有真实内容的章节必须删除。</item>
    <item>草稿的文件内容不得包含【】占位符、模板外围说明或代码围栏；回复可以使用代码围栏区分两份草稿，但围栏不属于文件内容。</item>
    <item>不要创建新的规则文件、Skill、符号链接或其他文档。</item>
    <item>不要联网，不要修改任何文件。</item>
    <item>遇到真正冲突的个人偏好时列出冲突；其他问题采用现有证据支持的最保守方案。</item>
  </constraints>

  <success_criteria>
    <item>现有用户级规则全部有明确去向。</item>
    <item>用户级草稿只包含跨项目稳定规则。</item>
    <item>项目级草稿足以说明 {project} 的用途，但不复制可发现的仓库结构。</item>
    <item>两份草稿之间没有重复或冲突。</item>
    <item>两份草稿均可在审阅后直接写入目标路径。</item>
  </success_criteria>

  <output_contract>
    <format>Markdown</format>
    <structure>
      依次输出：
      1. “规则分类”表格：现有内容、处理方式、目标位置、理由。
      2. “用户级草稿”：完整文件内容。
      3. “项目级草稿”：完整文件内容。
      4. “需要用户决定”：只列无法从现有证据解决的真实冲突；没有则写“无”。
      5. “自检结果”：逐项报告成功标准是否满足。
    </structure>
    <delivery>只在回复中展示草稿，不写入文件。使用独立 Markdown 代码围栏展示每份草稿，并明确标注围栏不属于文件内容。</delivery>
  </output_contract>

  <self_check>
    输出前检查遗漏规则、错误分层、重复内容、冲突、过时路径、占位符、空章节、不可执行要求和未经证据支持的新增规则。
  </self_check>
</prompt>
```

Agent 本轮应输出：

1. 现有规则的分类表。
2. 完整的用户级草稿。
3. 完整的项目级草稿。
4. 确实需要用户决定的冲突。
5. 自检结果。

Agent 本轮不应修改文件。

### 第三步：审阅并写入

只检查以下四点：

- 用户级草稿是否包含项目专属路径或命令。
- 项目级草稿是否重复用户级规则。
- Agent 是否删除了仍需保留的个人偏好。
- 两份草稿是否存在 `【】` 占位符、空章节或互相冲突的规则。

确认草稿后，向同一个 Agent 发送：

```text
应用已审阅的两份草稿。

1. 先为 /Users/{user}/.codex/AGENTS.md 创建带时间戳的备份。
2. 将已审阅的用户级草稿写入 /Users/{user}/.codex/AGENTS.md。
3. 将已审阅的项目级草稿写入 /Users/{user}/project/{project}/AGENTS.md。
4. 不修改其他文件。
5. 写入后检查占位符、空章节、重复规则和冲突。
6. 报告实际写入路径、备份路径、检查结果和项目级 AGENTS.md 的 Git diff。
```

## 3. 写入后验证

写入后新建项目会话。不要使用原会话验证，因为原会话可能仍保留修改前的上下文。

发送：

```text
用一句话说明当前仓库的用途，并分别列出本次会话中适用的用户级规则类型和项目级规则类型。不要修改文件，不要复述完整规则。
```

验收结果：

- 仓库用途与 `{project}` 项目级文件一致。
- 用户级内容只体现跨项目偏好。
- 项目级内容只体现当前仓库约束。
- Agent 没有引用模板占位符或模板说明。

## 4. 后续维护

- 用户级文件只在个人偏好真实变化时修改。
- 项目级普通规则至少有两次独立会话证据后再新增；安全和数据完整性规则除外。
- 每轮最多修改五处。
- 窄流程进入 Skill，局部约束进入局部 `AGENTS.md`，可发现事实留在代码和配置中。
- 没有新证据时，不修改文件。

## 写 Agents.md 小技巧

- 避免用 /init 自动生成 AGENTS.md，因其易产生冗余和易过时信息，长期干扰 Agent 判断。应手动维护精炼、稳定的内容。
- 避免记录Agent能自行检索到的易变信息（如文件路径、模块位置等），应聚焦于稳定且难以从代码推断的关键内容：项目目标、约束、工具链和通用原则。
- 根目录 AGENTS.md 应保持精简，仅作为入口和路由，引导按需加载独立文档或 Skills 中的详细规则，避免上下文噪音。Monorepo 可按目录分层放置 AGENTS.md。
- Agents.md 每次开始工作时都会读取的一组高优先级上下文，所以每增加一条内容，都问自己：新增内容是否值得在每一次任务里占用 Agent 的注意力？

精简Agents.md的意义不只是节省 Token，更重要的是管理 Agent 的注意力。

## 精简的结构

```md
## 项目描述

{这一句话为智能体提供了为什么在这个仓库中工作的背景，为它的每一个决策定下基调}

## 工具、命令

- Package manager: `pnpm`
- Verify: `pnpm typecheck && pnpm test`

## Repository-wide rules

- 只保留反复被证明有价值或安全关键的规则。

## On-demand guidance

- TypeScript：`docs/agent/typescript.md`
- Testing：`docs/agent/testing.md`
```
将语言特定规则移入独立文件。

## 用这段提示词修复有问题的 AGENTS.md

```md
我希望你按照渐进式披露原则重构我的 AGENTS.md 文件。请遵循以下步骤：
1. 找出矛盾：识别所有相互冲突的指令。对于每一条矛盾，询问我希望保留哪个版本。
2. 识别核心内容：只提取应属于根目录 AGENTS.md 的内容：
   - 一句话的项目描述
   - 包管理器（如果不是 npm）
   - 非标准的构建/类型检查命令
   - 与每个任务都真正相关的内容
3. 归组其余内容：将剩余指令按逻辑类别组织（例如 TypeScript 约定、测试模式、API 设计、Git 工作流）。为每个类别创建独立的 markdown 文件。
4. 创建文件结构：输出：
   - 一个极简的根 AGENTS.md，其中包含指向各独立文件的 markdown 链接
   - 每个独立文件及其相关指令
   - 建议的 docs/ 目录结构
5. 标记应删除的内容：识别以下指令：
   - 冗余的（智能体已经知道的内容）
   - 过于模糊、无法执行的
   - 过于显而易见的（如"写出干净的代码"）
```
