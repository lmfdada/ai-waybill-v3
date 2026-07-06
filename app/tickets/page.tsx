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
  assigneeRole: string;
  version: number;
  dueAt: string;
};

type User = {
  id: string;
  name: string;
  role: string;
  enabled: boolean;
};

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [message, setMessage] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [actorId, setActorId] = useState("approver-a");
  const [loadingKey, setLoadingKey] = useState("");
  const [form, setForm] = useState({ waybillNo: "JT202607060002", type: "damaged", amount: "5600", description: "客户反馈到货破损，需要理赔并重新发货" });

  async function load() {
    const [ticketRes, userRes] = await Promise.all([fetch("/api/tickets?pageSize=100"), fetch("/api/users")]);
    const ticketJson = await ticketRes.json();
    const userJson = await userRes.json();
    setTickets(ticketJson.data.items);
    if (userJson.success) setUsers(userJson.data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  function currentUser() {
    return users.find((user) => user.id === actorId);
  }

  function canApprove(ticket: Ticket) {
    const actor = currentUser();
    if (!actor || !actor.enabled) return false;
    if (ticket.reporterId === actor.id) return false;
    if (actor.role === "admin") return true;
    if (ticket.assigneeId && ticket.assigneeId !== actor.id) return false;
    if (ticket.status === "level1_review") return actor.role === "level1_approver";
    if (ticket.status === "level2_review") return actor.role === "level2_approver";
    return false;
  }

  function approvalHint(ticket: Ticket) {
    const actor = currentUser();
    if (!actor) return "请选择操作人";
    if (!actor.enabled) return "当前操作人已禁用";
    if (ticket.reporterId === actor.id) return "上报人不能审批自己提交的工单";
    if (ticket.assigneeId && ticket.assigneeId !== actor.id && actor.role !== "admin") return `已分配给 ${ticket.assigneeId}`;
    if (ticket.status === "level1_review" && actor.role !== "level1_approver" && actor.role !== "admin") return "需要一级审批人";
    if (ticket.status === "level2_review" && actor.role !== "level2_approver" && actor.role !== "admin") return "需要二级审批人";
    return "";
  }

  async function createTicket() {
    const actor = currentUser();
    if (!actor) {
      setMessage("请选择上报操作人");
      return;
    }
    if (actor.role !== "operator" && actor.role !== "admin") {
      setMessage("当前角色不适合发起手工上报，请选择操作员或管理员");
      return;
    }
    if (!window.confirm(`确认以 ${actor.name} 身份创建 ${form.type} 工单？`)) return;
    setLoadingKey("create");
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": actor.id, "x-user-role": actor.role },
      body: JSON.stringify({ ...form, amount: Number(form.amount) }),
    });
    const json = await res.json();
    setMessage(json.message);
    setLoadingKey("");
    await load();
  }

  async function suggest() {
    setLoadingKey("suggest");
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
    setLoadingKey("");
  }

  async function approve(ticket: Ticket, result: "approved" | "rejected") {
    const actor = currentUser();
    if (!actor) {
      setMessage("请选择审批操作人");
      return;
    }
    const hint = approvalHint(ticket);
    if (hint) {
      setMessage(hint);
      return;
    }
    if (!window.confirm(`确认由 ${actor.name} ${result === "approved" ? "通过" : "拒绝"} 工单 ${ticket.id}？`)) return;
    const key = `${ticket.id}-${result}`;
    setLoadingKey(key);
    const res = await fetch(`/api/tickets/${ticket.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": actor.id, "x-user-role": actor.role },
      body: JSON.stringify({
        result,
        comment: result === "approved" ? "同意处理，按规则执行联动" : "资料不足，退回补充",
        expectedVersion: ticket.version,
        operationKey: `${ticket.id}-${ticket.version}-${result}`,
      }),
    });
    const json = await res.json();
    setMessage(json.message);
    setLoadingKey("");
    await load();
  }

  async function resubmit(ticket: Ticket) {
    const actor = currentUser();
    if (!actor) {
      setMessage("请选择重提操作人");
      return;
    }
    if (ticket.reporterId !== actor.id && actor.role !== "admin") {
      setMessage("只有上报人或管理员可以重新提交");
      return;
    }
    const comment = window.prompt("请输入补充说明", "已补充凭证，重新提交审批");
    if (!comment) return;
    if (!window.confirm(`确认重新提交工单 ${ticket.id}？`)) return;
    const key = `${ticket.id}-resubmit`;
    setLoadingKey(key);
    const res = await fetch(`/api/tickets/${ticket.id}/resubmit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": actor.id, "x-user-role": actor.role },
      body: JSON.stringify({
        comment,
        expectedVersion: ticket.version,
        operationKey: `${ticket.id}-${ticket.version}-resubmit`,
      }),
    });
    const json = await res.json();
    setMessage(json.message);
    setLoadingKey("");
    await load();
  }

  async function seed() {
    if (!window.confirm("确认生成 200+ 条测试工单？")) return;
    setLoadingKey("seed");
    const res = await fetch("/api/seed", { method: "POST" });
    const json = await res.json();
    setMessage(`已生成测试数据，当前 ${json.data.ticketCount} 条`);
    setLoadingKey("");
    await load();
  }

  return (
    <div className="grid">
      <section className="card" style={{ gridColumn: "span 4" }}>
        <div className="card-header">
          <div className="card-title">手工上报物流异常</div>
        </div>
        <div className="card-body">
          <label className="form-row"><span>当前操作人</span><select className="select" value={actorId} onChange={(e) => setActorId(e.target.value)}>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name} / {user.role}{user.enabled ? "" : "（禁用）"}</option>)}
          </select></label>
          <p style={{ color: "var(--muted)", fontSize: 12, marginTop: -4 }}>审批会按当前操作人的真实角色和分配人校验；无权限时按钮禁用并显示原因。</p>
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
            <button className="btn" disabled={!!loadingKey} onClick={suggest}>{loadingKey === "suggest" ? "建议中..." : "AI 建议"}</button>
            <button className="btn btn-primary" disabled={!!loadingKey} onClick={createTicket}>{loadingKey === "create" ? "创建中..." : "创建工单"}</button>
            <button className="btn" disabled={!!loadingKey} onClick={seed}>{loadingKey === "seed" ? "生成中..." : "生成 200+ 测试工单"}</button>
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
                          <button className="btn btn-primary" title={approvalHint(ticket)} disabled={!!loadingKey || !canApprove(ticket)} onClick={() => approve(ticket, "approved")}>{loadingKey === `${ticket.id}-approved` ? "处理中..." : "通过"}</button>
                          <button className="btn btn-danger" title={approvalHint(ticket)} disabled={!!loadingKey || !canApprove(ticket)} onClick={() => approve(ticket, "rejected")}>{loadingKey === `${ticket.id}-rejected` ? "处理中..." : "拒绝"}</button>
                          {approvalHint(ticket) && <span className="tag tag-warning">{approvalHint(ticket)}</span>}
                        </>
                      ) : ticket.status === "rejected" ? (
                        <button className="btn" disabled={!!loadingKey} onClick={() => resubmit(ticket)}>{loadingKey === `${ticket.id}-resubmit` ? "重提中..." : "重新提交"}</button>
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
