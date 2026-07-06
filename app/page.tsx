import { db, hydrateStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await hydrateStore();
  const store = db();
  const nowMs = new Date("2026-07-06T00:00:00.000Z").getTime();
  const openTickets = store.tickets.filter((ticket) => !["completed", "closed"].includes(ticket.status));
  const qualityHeld = store.tickets.filter((ticket) => ticket.category === "quality" && !["completed", "closed"].includes(ticket.status));
  const dueSoon = openTickets.filter((ticket) => new Date(ticket.dueAt).getTime() - nowMs < 2 * 60 * 60 * 1000);

  return (
    <div className="grid">
      <section className="card stat" style={{ gridColumn: "span 3" }}>
        <div className="stat-label">开放工单</div>
        <div className="stat-value">{openTickets.length}</div>
      </section>
      <section className="card stat" style={{ gridColumn: "span 3" }}>
        <div className="stat-label">品控暂扣</div>
        <div className="stat-value">{qualityHeld.length}</div>
      </section>
      <section className="card stat" style={{ gridColumn: "span 3" }}>
        <div className="stat-label">即将超时</div>
        <div className="stat-value">{dueSoon.length}</div>
      </section>
      <section className="card stat" style={{ gridColumn: "span 3" }}>
        <div className="stat-label">接口调用日志</div>
        <div className="stat-value">{store.syncLogs.length}</div>
      </section>

      <section className="card" style={{ gridColumn: "span 8" }}>
        <div className="card-header">
          <div className="card-title">最近工单</div>
          <span className="tag">状态机驱动</span>
        </div>
        <div className="card-body">
          <table className="table">
            <thead><tr><th>工单</th><th>来源</th><th>类型</th><th>状态</th><th>金额</th><th>截止</th></tr></thead>
            <tbody>
              {store.tickets.slice(0, 8).map((ticket) => (
                <tr key={ticket.id}>
                  <td>{ticket.id}</td>
                  <td>{ticket.source === "scan" ? "扫描触发" : "手工上报"}</td>
                  <td>{ticket.type}</td>
                  <td><span className="tag">{ticket.status}</span></td>
                  <td>¥{ticket.amount}</td>
                  <td>{new Date(ticket.dueAt).toLocaleString("zh-CN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ gridColumn: "span 4" }}>
        <div className="card-header">
          <div className="card-title">核心设计</div>
        </div>
        <div className="card-body" style={{ display: "grid", gap: 10, fontSize: 13, color: "var(--muted)" }}>
          <div>V3 独立系统，不直接连接 V2 数据库。</div>
          <div>工单状态机与扫描批次状态机分离。</div>
          <div>审批、赔付、库存联动保留审批记录追溯。</div>
          <div>V2 调用写入 Request ID 与同步日志。</div>
        </div>
      </section>
    </div>
  );
}
