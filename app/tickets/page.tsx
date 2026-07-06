"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Ticket = {
  id: string;
  source: string;
  category: string;
  type: string;
  status: string;
  waybillNo: string;
  amount: number;
  reporterId: string;
  assigneeId?: string;
  version: number;
  dueAt: string;
};

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [message, setMessage] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [form, setForm] = useState({ waybillNo: "JT202607060002", type: "damaged", amount: "5600", description: "客户反馈到货破损，需要理赔并重新发货" });

  async function load() {
    const res = await fetch("/api/tickets?pageSize=100");
    const json = await res.json();
    setTickets(json.data.items);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function createTicket() {
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": "operator-b", "x-user-role": "operator" },
      body: JSON.stringify({ ...form, amount: Number(form.amount) }),
    });
    const json = await res.json();
    setMessage(json.message);
    await load();
  }

  async function suggest() {
    const res = await fetch("/api/ai/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: form.description, amount: Number(form.amount) }),
    });
    const json = await res.json();
    if (json.success) {
      setAiSuggestion(JSON.stringify(json, null, 2));
      setForm((prev) => ({ ...prev, type: json.data.type || prev.type }));
    } else {
      setAiSuggestion(json.message || "AI 建议失败");
    }
  }

  async function approve(ticket: Ticket, result: "approved" | "rejected") {
    const role = ticket.status === "level2_review" ? "level2_approver" : "level1_approver";
    const res = await fetch(`/api/tickets/${ticket.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": "approver-a", "x-user-role": role },
      body: JSON.stringify({
        result,
        comment: result === "approved" ? "同意处理，按规则执行联动" : "资料不足，退回补充",
        expectedVersion: ticket.version,
        operationKey: `${ticket.id}-${ticket.version}-${result}`,
      }),
    });
    const json = await res.json();
    setMessage(json.message);
    await load();
  }

  async function seed() {
    const res = await fetch("/api/seed", { method: "POST" });
    const json = await res.json();
    setMessage(`已生成测试数据，当前 ${json.data.ticketCount} 条`);
    await load();
  }

  return (
    <div className="grid">
      <section className="card" style={{ gridColumn: "span 4" }}>
        <div className="card-header">
          <div className="card-title">手工上报物流异常</div>
        </div>
        <div className="card-body">
          <label className="form-row"><span>运单号</span><input className="input" value={form.waybillNo} onChange={(e) => setForm({ ...form, waybillNo: e.target.value })} /></label>
          <label className="form-row"><span>类型</span><select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="lost">丢件</option>
            <option value="damaged">破损</option>
            <option value="rejected">客户拒收</option>
            <option value="timeout">超时未签收</option>
            <option value="address_error">地址错误</option>
          </select></label>
          <label className="form-row"><span>金额</span><input className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
          <label className="form-row"><span>描述</span><textarea className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={suggest}>AI 建议</button>
            <button className="btn btn-primary" onClick={createTicket}>创建工单</button>
            <button className="btn" onClick={seed}>生成 200+ 测试工单</button>
          </div>
          {aiSuggestion && <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "#fafafa", padding: 10, border: "1px solid var(--border-light)", marginTop: 12 }}>{aiSuggestion}</pre>}
          {message && <p style={{ color: "var(--primary-dark)", fontSize: 13 }}>{message}</p>}
        </div>
      </section>

      <section className="card" style={{ gridColumn: "span 8" }}>
        <div className="card-header">
          <div className="card-title">工单列表与审批</div>
          <span className="tag">{tickets.length} 条</span>
        </div>
        <div className="card-body" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>ID</th><th>来源</th><th>类型</th><th>状态</th><th>分配人</th><th>运单</th><th>金额</th><th>截止</th><th>操作</th></tr></thead>
            <tbody>
              {tickets.map((ticket) => {
                const dueSoon = new Date(ticket.dueAt).getTime() - new Date("2026-07-06T00:00:00.000Z").getTime() < 2 * 60 * 60 * 1000;
                return (
                  <tr key={ticket.id}>
                    <td>{ticket.id}</td>
                    <td>{ticket.source === "scan" ? <span className="tag-warning">扫描</span> : <span className="tag">手工</span>}</td>
                    <td>{ticket.type}</td>
                    <td><span className={dueSoon ? "tag tag-danger" : "tag"}>{ticket.status}</span></td>
                    <td>{ticket.assigneeId || "-"}</td>
                    <td>{ticket.waybillNo}</td>
                    <td>¥{ticket.amount}</td>
                    <td>{new Date(ticket.dueAt).toLocaleString("zh-CN")}</td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <Link className="btn" href={`/tickets/${ticket.id}`}>详情</Link>
                      {["level1_review", "level2_review"].includes(ticket.status) ? (
                        <>
                          <button className="btn btn-primary" onClick={() => approve(ticket, "approved")}>通过</button>
                          <button className="btn btn-danger" onClick={() => approve(ticket, "rejected")}>拒绝</button>
                        </>
                      ) : <span className="tag-muted tag">无操作</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
