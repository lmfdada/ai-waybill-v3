"use client";

import { useEffect, useState } from "react";

type InventoryData = {
  batches: Array<{ id: string; skuCode: string; batchNo: string; totalQty: number; availableQty: number; lockedQty: number; status: string; updatedAt: string }>;
  locks: Array<{ id: string; ticketId: string; skuCode: string; batchNo: string; qty: number; status: string; reason: string; updatedAt: string }>;
  records: Array<{ id: string; ticketId: string; approvalId: string; skuCode: string; batchNo: string; changeType: string; qty: number; createdAt: string }>;
};

export default function InventoryPage() {
  const [data, setData] = useState<InventoryData | null>(null);

  async function load() {
    const res = await fetch("/api/inventory");
    const json = await res.json();
    setData(json.data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  return (
    <div className="grid">
      <section className="card" style={{ gridColumn: "span 12" }}>
        <div className="card-header">
          <div>
            <div className="card-title">库存批次</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>品控暂扣会减少可用量、增加锁定量；放行或执行动作会释放/消耗锁定。</div>
          </div>
          <button className="btn" onClick={load}>刷新</button>
        </div>
        <div className="card-body" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>SKU</th><th>批次</th><th>总量</th><th>可用</th><th>锁定</th><th>状态</th><th>更新时间</th></tr></thead>
            <tbody>{(data?.batches || []).map((item) => <tr key={item.id}><td>{item.skuCode}</td><td>{item.batchNo}</td><td>{item.totalQty}</td><td>{item.availableQty}</td><td>{item.lockedQty}</td><td><span className={item.status === "locked" ? "tag tag-warning" : "tag"}>{item.status}</span></td><td>{new Date(item.updatedAt).toLocaleString("zh-CN")}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ gridColumn: "span 6" }}>
        <div className="card-header"><div className="card-title">锁定记录</div></div>
        <div className="card-body" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>工单</th><th>SKU</th><th>批次</th><th>数量</th><th>状态</th><th>原因</th></tr></thead>
            <tbody>{(data?.locks || []).map((item) => <tr key={item.id}><td>{item.ticketId}</td><td>{item.skuCode}</td><td>{item.batchNo}</td><td>{item.qty}</td><td>{item.status}</td><td>{item.reason}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ gridColumn: "span 6" }}>
        <div className="card-header"><div className="card-title">库存流水</div></div>
        <div className="card-body" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>工单</th><th>审批</th><th>SKU</th><th>动作</th><th>数量</th><th>时间</th></tr></thead>
            <tbody>{(data?.records || []).map((item) => <tr key={item.id}><td>{item.ticketId}</td><td>{item.approvalId}</td><td>{item.skuCode}</td><td>{item.changeType}</td><td>{item.qty}</td><td>{new Date(item.createdAt).toLocaleString("zh-CN")}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

