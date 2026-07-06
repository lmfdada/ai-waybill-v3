# 运单全流程管理系统 V3

V3 是独立于 V2 的运单全生命周期管理系统。它通过 HTTP API 调用 V2 获取运单与 SKU 数据，在本地保存只读快照和接口同步日志，并管理扫描品控、异常工单、分级审批、赔付与库存联动。

## 启动

```bash
npm install
npm run dev
```

默认访问 `http://localhost:3000`。

## 环境变量

```bash
V2_API_BASE_URL=http://localhost:3001
V2_API_KEY=dev-v2-api-key
DATABASE_URL=postgresql://...
V3_JOB_TOKEN=dev-v3-job-token
AI_API_KEY=optional
AI_BASE_URL=https://api.deepseek.com/v1/chat/completions
AI_MODEL=deepseek-chat
```

本地不配置 `DATABASE_URL` 时使用 SQLite；生产环境配置 `DATABASE_URL` 后自动切换到独立 Neon/Postgres。V2 接口不可用时会优先使用 V3 本地快照/演示数据降级，并写入接口同步日志，页面会明确标注数据来源。

## 与 V2 联调

建议 V2 和 V3 分别使用不同端口：

```bash
# V2: /Users/limengfei/Desktop/test/ai-exam-practice
npm run dev -- -p 3001

# V3: /Users/limengfei/Desktop/test/ai-waybill-v3
V2_API_BASE_URL=http://localhost:3001 npm run dev -- -p 3000
```

V2 已提供的接口路径：

- `GET /api/v2/waybills`
- `GET /api/v2/waybills/{waybillNo}`
- `GET /api/v2/waybills/{waybillNo}/skus/{skuCode}`
- `POST /api/v2/waybills/{waybillNo}/exception-marker`

## 规则配置

访问 `/rules` 可调整：

- 审批分级规则：金额阈值、审批层级、超时时长、重提次数。
- 品控触发规则：异常子类型、触发条件、阈值、严重度、进入审批层级。

对应 API：

- `GET/POST /api/rules/approval`
- `GET/POST /api/rules/qc`

## 工单追踪

工单列表 `/tickets` 可进入详情页 `/tickets/{ticketId}`。详情页展示：

- 工单状态、版本号、处理角色和截止时间
- 运单信息来源：实时 V2 / 本地缓存 / mock
- 审批与状态变更历史
- 扫描记录和命中规则
- 赔付记录与库存流水，并关联触发它们的审批记录 ID

## 后台任务

统一 Cron 入口：

```bash
curl "http://localhost:3000/api/cron?token=dev-v3-job-token"
```

超时自动流转接口：

```bash
curl -X POST http://localhost:3000/api/jobs/timeouts \
  -H "x-job-token: dev-v3-job-token"
```

禁用审批人兜底转交接口：

```bash
curl -X POST http://localhost:3000/api/jobs/reassign-disabled \
  -H "x-job-token: dev-v3-job-token"
```

部署后可接 Vercel Cron。当前 `vercel.json` 按 Vercel Hobby 限制配置为每天一次；如升级 Pro，可把 Cron 调整为更高频率。生产环境请设置 `V3_JOB_TOKEN`。

## 权限角色

访问 `/access` 可查看和启停演示用户。审批接口会校验：

- 操作人角色必须匹配当前审批层级。
- 上报人不能审批自己提交的工单。
- 工单如已分配具体审批人，非该审批人或管理员不能审批。
- 审批人禁用后，可通过兜底任务自动转交给同角色可用审批人。

## 交付文档

- `docs/interface-contract.md`
- `docs/assumptions.md`
- `docs/data-model.md`
- `docs/execution-policy.md`
- `docs/reflection.md`
- `docs/ai-usage.md`
- `docs/deployment.md`

## AI 建议

扫描页和工单上报页提供“AI 建议”按钮。建议结果必须人工确认，不会自动执行。未配置 AI Key 时使用规则化兜底建议，主流程不受影响。

## 数据库

本地使用独立 SQLite 数据库 `data/v3.db`。生产环境使用独立 Neon/Postgres，由 `DATABASE_URL` 控制。该数据库只属于 V3，用于保存工单、扫描、审批、赔付、库存、规则和 V2 调用日志；V3 不直接连接 V2 数据库。
