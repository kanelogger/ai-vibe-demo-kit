# Knowledge Routing

Agent 应先定位，再读取。禁止为了“了解项目”而默认全量加载 `source/knowledge/`。

## 提取线索

从当前需求中提取已明确出现的线索：

- 应用、模块、业务域
- 接口、消息 Topic、事件
- 状态、模型、表、字段
- 用户路径、错误码、日志关键词

无法从需求确认的线索应标记为未知，不要自行补全。

## 路由顺序

```text
需求线索
  -> source/knowledge/INDEX.md
  -> 候选应用总览
  -> 应用 INDEX.md
  -> product 主干或 solution 差异
  -> base 定位入口
  -> tech 加载实现约束
  -> 当前代码核对
```

## 路由表

| Signal | Read first | Then | Verify in code |
| --- | --- | --- | --- |
| 应用名或模块名 | 对应应用 `INDEX.md` | `ARCHITECTURE.md` | 模块入口和依赖 |
| Topic 或事件 | `domain/base/messages.md` | 关联 flow 与 rule | Producer、Consumer、配置 |
| 接口或模型 | `domain/base/interfaces.md` | 关联 product/solution | 签名、DTO、调用者 |
| 状态或业务规则 | 相关 state/rule 文档 | 关联 flow | 枚举、状态转换、测试 |
| 技术约束 | `tech/` 对应文档 | 编码规则 | 当前框架与邻近实现 |

## 冲突处理

代码、正式文档和人工确认发生冲突时停止合并结论，在当前需求的 `clarification.md` 记录冲突及证据。确认后再更新正式知识。
