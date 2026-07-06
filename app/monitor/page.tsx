"use client";

import { useEffect, useState } from "react";

type Monitor = {
  latestSyncAt: string | null;
  successRate: number;
  ticketCount: number;
  openQualityTickets: number;
  logs: Array<{ id: string; requestId: string; endpoint: string; statusCode: number; success: boolean; durationMs: number; errorMessage: string; createdAt: string }>;
};

export default function MonitorPage() {
  const [data, setData] = useState<Monitor | null>(null);

  async function load() {
    const res = await fetch("/api/monitor");
    const json = await res.json();
    setData(json.data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  return (
    <div className="grid">
      <section className="card stat" style={{ gridColumn: "span 3" }}>
        <div className="stat-label">最近同步</div>
        <div style={{ fontSize: 14, marginTop: 10 }}>{data?.latestSyncAt ? new Date(data.latestSyncAt).toLocaleString("zh-CN") : "暂无"}</div>
      </section>
      <section className="card stat" style={{ gridColumn: "span 3" }}>
        <div className="stat-label">接口成功率</div>
        <div className="stat-value">{data?.successRate ?? 100}%</div>
      </section>
      <section className="card stat" style={{ gridColumn: "span 3" }}>
        <div className="stat-label">工单总数</div>
        <div className="stat-value">{data?.ticketCount ?? 0}</div>
      </section>
      <section className="card stat" style={{ gridColumn: "span 3" }}>
        <div className="stat-label">开放品控工单</div>
        <div className="stat-value">{data?.openQualityTickets ?? 0}</div>
      </section>
      <section className="card" style={{ gridColumn: "span 12" }}>
        <div className="card-header">
          <div className="card-title">V2 接口调用日志</div>
          <button className="btn" onClick={load}>刷新</button>
        </div>
        <div className="card-body" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>Request ID</th><th>接口</th><th>状态码</th><th>耗时</th><th>结果</th><th>错误</th><th>时间</th></tr></thead>
            <tbody>
              {(data?.logs || []).map((log) => (
                <tr key={log.id}>
                  <td>{log.requestId}</td>
                  <td>{log.endpoint}</td>
                  <td>{log.statusCode}</td>
                  <td>{log.durationMs}ms</td>
                  <td>{log.success ? <span className="tag">成功</span> : <span className="tag-danger tag">失败/降级</span>}</td>
                  <td>{log.errorMessage || "-"}</td>
                  <td>{new Date(log.createdAt).toLocaleString("zh-CN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
