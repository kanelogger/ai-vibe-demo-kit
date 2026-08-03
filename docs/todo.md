## todo
1. [x] harness 层使用 `.agents/skills.json` v2 管理 Skill catalog 与确定性工作流路由。
   1. [x] PRD 路由强制返回三句话简报和 Source Register 要求。
   2. [x] 测试策略根据 `.harness/config.json` 区分“初始化测试基础设施”和“同步更新并实际运行现有测试”。
   3. [x] UI 快速验证优先 `browser-skill`，完整 Playwright 留在 `acceptance-ready` 配置门禁。
2. Agents.md 或者 引用文件里写清楚当前的开发环境和开发工具。
3. 如果是在具体项目里面，文件夹下提供索引，写每个文件的时候依赖前置。
4. 私有数据接个MCP就可以，比如写一个 Codex 插件能读取私有数据，那么 Codex 就可以访问这些私有数据，做很多事
5. MDN文档官方提供MCP服务
