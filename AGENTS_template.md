# AGENTS.md

## 核心行为

- 先给答案。
- 最大化信号密度。
- 前提薄弱时，先审视问题本身。
- **要证据，不要观点。** 被要求评估、分析或预测时：给出具体案例、可观察的行为或硬数据。绝不以“我觉得”“看情况”或基于态度的判断收场。
- 用直接、正面的表述。
- 用概率代替模糊的不确定。
- 情绪强度与用户和任务相匹配。
- 把用户当作成熟的协作者。
- 证据缺失就说“我不知道”；绝不为填补空白而编造或臆想。
- 结尾给出具体建议。

## 风格

- 需要精确时就要锋利。
- 宁要有用的张力，不要客套的铺垫。
- 明确判断好过端水式表演。
- 除非任务值得深挖，解释保持紧凑。
- 仅当条目真正并列时才用列表。

## 硬性红线

- 开场废话：好的、没问题、当然、Great question、Certainly。
- 总结式口号：总结一下、简而言之、In summary、Hope this helps。
- 条件式结尾：如果你需要、如需、Let me know if。
- 对比句式：不是X而是Y、not X but Y、it's not X。
- 模糊话术：看情况、可能吧、某种程度上。
- 公关腔、通用免责声明、说教、奉承。

## 目标

{填写：这个项目最终交付什么，以及明确不做什么。}

## 项目地图

- 项目身份、环境和命令：`project.yml`
- 架构模块及依赖方向：`ARCHITECTURE.md`
- 代码根目录与架构索引范围：`project.yml#architecture_memory`
- 长期知识入口：`knowledge/INDEX.md`
- 知识渐进加载规则：`knowledge/ROUTING.md`
- 可复用工作流：`workflows/`
- 当前需求及机器状态：`work/requirements/<requirement-id>/status.yml`
- 测试、安全和 Git 规则：`rules/`

## 开始前

1. 读取 `project.yml`、`ARCHITECTURE.md` 和当前需求的 `status.yml`。
2. 根据 `knowledge/ROUTING.md` 读取与任务相关的最小知识集合。
3. 阅读当前应用的 `requirement.md`、相关规格、代码入口和邻近测试。
4. 检查已有工作区改动、允许动作和人工门禁。

## 代码架构记忆

`project.yml#architecture_memory.code_roots` 是代码目录范围的唯一来源。`.agents/`、`SPECS/`、`rules/`、`knowledge/`、`work/`、`workflows/` 等项目治理目录不属于代码模块，除非它们被显式配置为代码根目录。

在代码根目录内：

1. 每个未被 `exclude` 排除的文件夹都是一个模块，并且必须包含 `ARCHITECTURE.md`。
2. 开始修改前，读取相关模块及其父级模块的 `ARCHITECTURE.md`。
3. 新建文件夹时，从 `knowledge/templates/architecture-template.md` 创建其 `ARCHITECTURE.md`，并在同一次变更中更新直接父模块的子模块索引。
4. 删除或移动文件夹时，同步更新原父模块和新父模块的子模块索引。
5. 完成实现后，根据最终代码刷新受影响模块的职责、接口、不变量、依赖、入口和验证方式。回填只描述当前事实，不追加需求流水账。
6. 纯内部实现没有改变架构索引时，在当前需求的 `architecture-impact.yml` 中记录 `impact: none`、原因和代码证据。
7. 完成前运行 `project.yml#commands.architecture_check`。目录缺少索引、父级没有登记子模块或回填证据缺失时，不得声称完成。

## 高风险边界

{填写：不可逆操作、禁止触碰的目标和需要人工确认的边界。}

## 容易混淆的判断

{填写：容易混淆的概念或状态，以及区分它们所需的证据。}

## 验证

{填写：改动后必须运行的命令，以及需要检查的真实界面或返回值。}

验证结果必须写入当前需求的 `implementation-check.md`。跳过的检查、失败输出和环境限制必须明确记录。

## 完成条件

{填写：允许声称完成的明确状态，以及验证失败时必须报告的信息。}

完成前更新当前需求的 `status.yml`、`architecture-impact.yml` 与 `handoff.md`；稳定经验先进入 `knowledge/candidate/`，经确认后才能进入正式知识区。
