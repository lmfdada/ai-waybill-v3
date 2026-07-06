# 生产部署说明

## Vercel 项目

V3 必须作为独立 Vercel 项目部署，不能和 V2 共用同一个部署项目。

推荐环境变量：

```bash
V2_API_BASE_URL=https://your-v2-domain.vercel.app
V2_API_KEY=replace-with-secret
DATABASE_URL=postgresql://...
V3_JOB_TOKEN=replace-with-secret
AI_API_KEY=optional
AI_BASE_URL=https://api.deepseek.com/v1/chat/completions
AI_MODEL=deepseek-chat
```

## 数据库生产化

本地默认使用 SQLite `data/v3.db`，方便离线演示；生产环境设置 `DATABASE_URL` 后会自动切换到 Neon/Postgres，并在首次请求时创建 JSONB 持久化表和基础演示数据。

迁移原则：

- V3 数据库实例独立于 V2。
- 保留当前领域表边界：工单、审批、扫描、赔付、库存、规则、接口日志、用户。
- `approval_records.operation_key` 由业务写入前检查，防重复审批；后续可在结构化表迁移时补唯一索引。
- `exception_tickets.version` 用于并发冲突控制。
- `inventory_locks` 与 `inventory_batches` 用于品控暂扣期间的库存锁定。

## Cron

`vercel.json` 已按 Vercel Hobby 限制配置为每天调用一次：

```text
/api/cron
```

Vercel Cron 会携带官方 Cron 请求头；本地或手动调用时仍可通过 `x-job-token` 或 `?token=` 传入 `V3_JOB_TOKEN`。如升级 Pro，可将 `schedule` 改回更高频率，例如 `*/10 * * * *`。该入口会执行：

- 审批超时自动流转
- 禁用审批人工单兜底转交

## 部署前检查

```bash
npm run lint
npm run build
```

部署后需要验证：

- V3 能调用 V2 `/api/v2/waybills/*`
- 扫描 SKU 归属校验成功
- 工单上报会实时校验 V2 运单
- 接口监控页能看到 Request ID 和同步日志
- Cron 返回成功
