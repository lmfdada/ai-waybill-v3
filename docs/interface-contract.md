# V3 调用 V2 系统间接口文档

## 目标

V3 与 V2 独立部署、独立数据库。V3 不直接连接 V2 数据库，所有运单真实性校验、SKU 归属校验、运单详情展示与增量同步均通过 HTTP API 完成。

## 鉴权

V3 请求 V2 时携带：

- `x-api-key: ${V2_API_KEY}`
- `x-request-id: req_xxx`

V2 应校验 API Key。V3 将 Request ID、接口名、入参摘要、状态码、耗时和错误信息写入 `sync_logs`。

## 接口列表

### 1. 获取运单详情

`GET /api/v2/waybills/{waybillNo}`

返回字段：

```json
{
  "success": true,
  "data": {
    "waybillNo": "JT202607060001",
    "externalCode": "PS2512220005001",
    "receiverStore": "海口龙湖天街店",
    "receiverName": "林小满",
    "receiverPhone": "13800138001",
    "receiverAddress": "海南省海口市龙华区龙湖天街",
    "amount": 1280,
    "warehouseId": "WH-HN",
    "merchantId": "M-ZTOCC",
    "skus": []
  }
}
```

### 2. 校验 SKU 归属

`GET /api/v2/waybills/{waybillNo}/skus/{skuCode}`

用于扫描录入。V3 必须确认 SKU 属于该运单后才能进入品控规则引擎。

返回字段：

```json
{
  "success": true,
  "requestId": "req_xxx",
  "data": {
    "valid": true,
    "sku": {
      "skuCode": "SKU-DRY-001",
      "skuName": "常温烙锅底料",
      "expectedQty": 20,
      "batchNo": "BATCH-HK-001"
    },
    "waybill": {}
  }
}
```

### 3. 同步运单列表

`GET /api/v2/waybills?updatedAfter=...&page=1&pageSize=100`

用于初始化或增量刷新 V3 本地只读快照。

### 4. 异常状态回写 V2（加分项）

`POST /api/v2/waybills/{waybillNo}/exception-marker`

用于在 V2 详情页标注“该运单存在未关闭异常”，避免重复发货。

## 超时与重试

- 单次超时：2.5 秒。
- 重试次数：1 次。
- 只对读取类接口重试；写入回写接口需使用幂等键。
- 每次调用生成 Request ID，便于跨系统排查。

## 降级策略

如果 V2 不可用：

- 工单详情页优先展示 V3 本地快照，并标注“使用本地缓存，同步于 XX 时间”。
- 发起异常上报时，如果实时校验失败且无可信缓存，不允许创建工单。
- 监控页展示失败日志和错误原因，区分 404、超时、鉴权失败和网络错误。

## V2 老系统二开策略

如果 V2 当前没有对外接口，应新增 `/api/v2/*` 版本化接口，不修改现有导入和订单 API 的响应结构。新增字段只做向后兼容追加，不删除、不改名。金额字段如果从 `int` 升级为 `decimal`，V3 用字符串或 decimal 解析层接收，数据库用 `decimal`/`numeric`，避免浮点误差。
