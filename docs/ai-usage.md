# AI 建议说明

V3 提供可选 AI 辅助能力，用于异常类型、严重度和审批意见建议。

## 入口

- `POST /api/ai/suggest`
- 扫描页面 `/scan` 的“AI 建议”
- 工单上报页面 `/tickets` 的“AI 建议”

## 原则

- AI 建议只供人工参考，不自动审批、不自动执行、不自动创建赔付/库存流水。
- AI 服务超时或失败不会阻塞扫描、上报、审批主流程。
- 无 `AI_API_KEY` 时，系统使用规则化兜底建议，并明确标注来源为 `heuristic`。
- 建议结果包含 `basis`，说明参考依据，避免黑箱结论。

## 环境变量

```bash
AI_API_KEY=...
AI_BASE_URL=https://api.deepseek.com/v1/chat/completions
AI_MODEL=deepseek-chat
```

如果不配置这些变量，系统仍可完整运行。

