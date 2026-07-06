# V3 数据模型说明

V3 使用独立数据库，不直接连接 V2 数据库。当前本地实现使用 SQLite `data/v3.db`，部署到 Vercel/云环境时可替换为 Neon/Supabase/Turso，表边界保持一致。

## 表清单

| 表 | 用途 |
|---|---|
| `waybill_snapshots` | V3 本地只读运单快照。来源为 V2 API 或本地降级缓存，不作为 V2 主数据。 |
| `sync_logs` | 每次调用 V2 的 Request ID、接口、参数摘要、状态码、耗时和错误信息。 |
| `exception_tickets` | 异常工单主表，包含来源、类型、状态、金额、版本号、超时时间。 |
| `approval_records` | 审批和快速放行记录，记录操作者、层级、前后状态、幂等键。 |
| `compensation_records` | 赔付/追偿记录，包含 `direction` 区分赔付客户与向供应商追偿。 |
| `inventory_records` | 库存变更流水，关联审批记录和工单。 |
| `inventory_batches` | V3 自有库存批次，可展示总量、可用量、锁定量和批次状态。 |
| `inventory_locks` | 品控暂扣锁定记录，关联工单，工单关闭/放行时释放或消耗。 |
| `scan_records` | 每次扫描记录，品控异常时关联工单，重复扫描只追加记录。 |
| `qc_rules` | 品控规则配置，记录触发条件、阈值、严重度和进入审批层级。 |
| `approval_rules` | 审批分级规则，记录金额阈值、目标层级、超时和重提次数。 |
| `user_accounts` | V3 本地用户/角色配置，用于权限校验和禁用审批人兜底转交。 |

## 当前实现

V3 采用“领域 JSON + 关系型投影列”的存储方式：`data` 保存完整领域对象，常用查询和约束字段同步投影到关系型列，包括 `waybill_no`、`ticket_id`、`approval_id`、`operation_key`、`sku_code`、`batch_no`、`status`、`assignee_id`、`assignee_role`、`reporter_id`、`amount`、`version`、`due_at`、`updated_at` 等。

这样既保留领域模型演进弹性，又具备生产库需要的筛选、索引、唯一约束和审计追踪能力。SQLite 和 Neon/Postgres 启动时都会自动补齐投影列并回填历史 JSON 数据。

## 索引与约束

- `exception_tickets(status, assignee_id, source, type, waybill_no, due_at)`：支撑审批工作台筛选和待办查询。
- `exception_tickets(sku_code, batch_no, category, status)`：支撑品控批次锁定和跨运单阻断。
- `approval_records(operation_key)`：唯一索引，防止重复点击或任务重试生成重复审批。
- `scan_records(ticket_id, sku_code, batch_no, status)`：支撑扫描记录追溯。
- `compensation_records(ticket_id, approval_id, direction)`：支撑赔付方向和审批追溯。
- `inventory_records(ticket_id, approval_id, sku_code, batch_no)`：支撑库存流水追溯。
- `inventory_locks(sku_code, batch_no, status)`：支撑开放锁查询。
- `sync_logs(updated_at, status)`：支撑接口监控页。

## 一致性策略

- 创建品控工单时，同步写入工单表、扫描记录表、库存批次和锁定记录。
- `skuCode + batchNo` 存在未关闭品控工单时，其他运单不得继续引用该批次；同运单重复扫描只追加扫描记录。
- 审批操作使用 `ticket.version` 做并发冲突保护。
- 审批记录使用 `operationKey` 做幂等保护。
- 审批通过进入执行联动时，同步生成赔付记录和库存记录，并把 `approvalId` 写入下游记录，保证可追溯。
- 审批/赔付/库存/状态变更通过 `runAtomic` 原子提交：SQLite 使用本地事务，Neon/Postgres 使用 `transaction()`，失败时回滚内存状态并保留错误日志作为补偿入口。
- 拒绝后工单进入 `rejected`，上报人或管理员可重新提交，系统写入 `resubmitted` 审计记录并重新分配审批人。
- 快速放行仅允许品控主管/管理员，放行记录写入 `approval_records`，不允许静默解锁。
- 品控异常创建工单时写入 `inventory_locks` 并更新 `inventory_batches.lockedQty`，防止暂扣批次继续被当作可用库存。
- 超时自动流转由 `POST /api/jobs/timeouts` 触发，任务调用需要 `x-job-token`，可接 Vercel Cron。
- 审批人禁用兜底由 `POST /api/jobs/reassign-disabled` 触发，会把待审批工单转交给同角色可用人员并写入审批记录。
- Vercel Cron 可调用 `GET /api/cron?token=...`，一次执行超时流转和禁用审批人转交。

## 进一步生产化建议

如果工单量从万级增长到几十万级，可继续将投影列拆成完全范式化细表，并补充外键约束：

- `exception_tickets(id)` 主键。
- `approval_records(operation_key)` 唯一索引。
- `scan_records(ticket_id)` 外键。
- `compensation_records(approval_id)` 外键。
- `inventory_records(approval_id)` 外键。
- `exception_tickets(waybill_no, type, status)` 组合索引用于防重复上报。
- 品控开放工单可用 `sku_code + batch_no + closed_at IS NULL` 约束或事务内检查保证跨运单锁定；同运单重复扫描由扫描记录追加逻辑处理。

## 规则配置入口

后台页面 `/rules` 可以编辑 `qc_rules` 和 `approval_rules`。保存后写入 V3 独立数据库，扫描和新建工单流程会读取最新规则。

## 工单追踪入口

详情页 `/tickets/{ticketId}` 聚合 `exception_tickets`、`approval_records`、`scan_records`、`compensation_records`、`inventory_records` 和 V2 运单详情。页面会标注运单数据来源，并展示 Request ID，便于排查跨系统数据不一致。
