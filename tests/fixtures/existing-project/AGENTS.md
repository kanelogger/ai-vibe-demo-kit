# Existing Project Agent Notes

项目原有约束，接入 Harness 时必须保留：

- 所有改动必须兼容 Node 20。
- `src/` 下禁止引入第三方依赖。
- 发布前必须跑 `npm test`。
