"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";

type Detail = {
  ticket: {
    id: string;
    source: string;
    category: string;
    type: string;
    status: string;
    waybillNo: string;
    skuCode?: string;
    batchNo?: string;
    amount: number;
    description: string;
    reporterId: string;
    assigneeId?: string;
    assigneeRole: string;
    version: number;
    createdAt: string;
    updatedAt: string;
    dueAt: string;
  };
  waybill: null | {
    waybillNo: string;
    receiverStore: string;
    receiverName: string;
    receiverPhone: string;
    receiverAddress: string;
    amount: number;
    syncedAt: string;
    skus: Array<{ skuCode: string; skuName: string; expectedQty: number; batchNo: string }>;
  };
  waybillSource: string;
  waybillWarning: string;
  requestId: string;
  approvals: Array<{ id: string; level: string; actorId: string; actorRole: string; result: string; comment: string; fromStatus: string; toStatus: string; operationKey: string; createdAt: string }>;
  scans: Array<{ id: string; status: string; matchedRuleId?: string; decisionReason: string; description: string; createdAt: string }>;
  compensations: Array<{ id: string; approvalId: string; direction: string; amount: number; status: string; createdAt: string }>;
  inventory: Array<{ id: string; approvalId: string; skuCode: string; batchNo: string; changeType: string; qty: number; createdAt: string }>;
  inventoryLocks: Array<{ id: string; skuCode: string; batchNo: string; qty: number; status: string; reason: string; updatedAt: string }>;
};

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/tickets/${id}`);
    const json = await res.json();
    if (json.success) setDetail(json.data);
    else setMessage(json.message || "加载失败");
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function fastRelease() {
    const reason = window.prompt("请输入误判复核原因");
    if (!reason) return;
    const res = await fetch(`/api/tickets/${id}/fast-release`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": "qc-manager-a", "x-user-role": "qc_supervisor" },
      body: JSON.stringify({ reason }),
    });
    const json = await res.json();
    setMessage(json.message);
    await load();
  }

  if (!detail) {
    return (
      <div className="card">
        <div className="card-body">{message || "加载中..."}</div>
      </div>
    );
  }

  const ticket = detail.ticket;

  return (
    <div className="grid">
      <section className="card" style={{ gridColumn: "span 12" }}>
        <div className="card-header">
          <div>
            <div className="card-title">{ticket.id}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{ticket.waybillNo} · v{ticket.version} · Request ID {detail.requestId}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {ticket.category === "quality" && !["completed", "closed"].includes(ticket.status) && (
              <button className="btn btn-primary" onClick={fastRelease}>误判快速放行</button>
            )}
            <Link className="btn" href="/tickets">返回列表</Link>
          </div>
        </div>
        {message && <div className="card-body" style={{ paddingTop: 0, color: "var(--primary-dark)" }}>{message}</div>}
      </section>

      <section className="card" style={{ gridColumn: "span 5" }}>
        <div className="card-header"><div className="card-title">工单信息</div><span className="tag">{ticket.status}</span></div>
        <div className="card-body">
          <table className="table">
            <tbody>
              <tr><th>来源</th><td>{ticket.source === "scan" ? "扫描自动触发" : "手工上报"}</td></tr>
              <tr><th>类别</th><td>{ticket.category}</td></tr>
              <tr><th>类型</th><td>{ticket.type}</td></tr>
              <tr><th>金额</th><td>¥{ticket.amount}</td></tr>
              <tr><th>SKU / 批次</th><td>{ticket.skuCode || "-"} / {ticket.batchNo || "-"}</td></tr>
              <tr><th>上报人</th><td>{ticket.reporterId}</td></tr>
              <tr><th>当前处理人</th><td>{ticket.assigneeId || "-"} / {ticket.assigneeRole}</td></tr>
              <tr><th>截止时间</th><td>{new Date(ticket.dueAt).toLocaleString("zh-CN")}</td></tr>
              <tr><th>描述</th><td>{ticket.description}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ gridColumn: "span 7" }}>
        <div className="card-header">
          <div className="card-title">运单快照</div>
          <span className={detail.waybillSource === "v2_realtime" ? "tag" : "tag tag-warning"}>{detail.waybillSource}</span>
        </div>
        <div className="card-body">
          {detail.waybillWarning && <div className="tag tag-warning" style={{ marginBottom: 10 }}>{detail.waybillWarning}</div>}
          {detail.waybill ? (
            <>
              <table className="table">
                <tbody>
                  <tr><th>收货门店</th><td>{detail.waybill.receiverStore}</td></tr>
                  <tr><th>收货人</th><td>{detail.waybill.receiverName} / {detail.waybill.receiverPhone}</td></tr>
                  <tr><th>地址</th><td>{detail.waybill.receiverAddress}</td></tr>
                  <tr><th>同步时间</th><td>{new Date(detail.waybill.syncedAt).toLocaleString("zh-CN")}</td></tr>
                </tbody>
              </table>
              <table className="table" style={{ marginTop: 12 }}>
                <thead><tr><th>SKU</th><th>名称</th><th>数量</th><th>批次</th></tr></thead>
                <tbody>{detail.waybill.skus.map((sku) => <tr key={`${sku.skuCode}-${sku.batchNo}`}><td>{sku.skuCode}</td><td>{sku.skuName}</td><td>{sku.expectedQty}</td><td>{sku.batchNo}</td></tr>)}</tbody>
              </table>
            </>
          ) : "未获取到运单信息"}
        </div>
      </section>

      <section className="card" style={{ gridColumn: "span 12" }}>
        <div className="card-header"><div className="card-title">审批与状态历史</div></div>
        <div className="card-body" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>时间</th><th>层级</th><th>操作人</th><th>结果</th><th>状态变化</th><th>意见</th><th>幂等键</th></tr></thead>
            <tbody>
              {detail.approvals.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                  <td>{item.level}</td>
                  <td>{item.actorId} / {item.actorRole}</td>
                  <td><span className="tag">{item.result}</span></td>
                  <td>{item.fromStatus} → {item.toStatus}</td>
                  <td>{item.comment}</td>
                  <td>{item.operationKey}</td>
                </tr>
              ))}
              {detail.approvals.length === 0 && <tr><td colSpan={7}>暂无审批记录</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ gridColumn: "span 6" }}>
        <div className="card-header"><div className="card-title">扫描记录</div></div>
        <div className="card-body" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>时间</th><th>状态</th><th>命中规则</th><th>判定依据</th></tr></thead>
            <tbody>
              {detail.scans.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString("zh-CN")}</td><td>{item.status}</td><td>{item.matchedRuleId || "-"}</td><td>{item.decisionReason}</td></tr>)}
              {detail.scans.length === 0 && <tr><td colSpan={4}>暂无扫描记录</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ gridColumn: "span 6" }}>
        <div className="card-header"><div className="card-title">执行联动</div></div>
        <div className="card-body" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>类型</th><th>方向/动作</th><th>金额/数量</th><th>审批记录</th></tr></thead>
            <tbody>
              {detail.compensations.map((item) => <tr key={item.id}><td>赔付</td><td>{item.direction}</td><td>¥{item.amount}</td><td>{item.approvalId}</td></tr>)}
              {detail.inventory.map((item) => <tr key={item.id}><td>库存</td><td>{item.changeType} · {item.skuCode}</td><td>{item.qty}</td><td>{item.approvalId}</td></tr>)}
              {detail.inventoryLocks.map((item) => <tr key={item.id}><td>锁定</td><td>{item.status} · {item.skuCode}</td><td>{item.qty}</td><td>{item.reason}</td></tr>)}
              {detail.compensations.length + detail.inventory.length + detail.inventoryLocks.length === 0 && <tr><td colSpan={4}>暂无执行联动记录</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
