"use client";

import { useEffect, useState } from "react";

type User = {
  id: string;
  name: string;
  role: string;
  enabled: boolean;
  warehouseId: string;
  merchantId: string;
};

export default function AccessPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/users");
    const json = await res.json();
    setUsers(json.data || []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function save(user: User) {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user),
    });
    const json = await res.json();
    setMessage(json.success ? "用户已保存" : json.message || "保存失败");
    await load();
  }

  async function reassign() {
    const res = await fetch("/api/jobs/reassign-disabled", {
      method: "POST",
      headers: { "x-job-token": "dev-v3-job-token" },
    });
    const json = await res.json();
    setMessage(json.message);
  }

  function update(id: string, patch: Partial<User>) {
    setUsers((prev) => prev.map((user) => user.id === id ? { ...user, ...patch } : user));
  }

  return (
    <div className="grid">
      <section className="card" style={{ gridColumn: "span 12" }}>
        <div className="card-header">
          <div>
            <div className="card-title">权限角色</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>后端审批接口会校验角色、分配人和“上报人不能自审”。禁用审批人后可触发兜底转交。</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {message && <span className="tag">{message}</span>}
            <button className="btn btn-primary" onClick={reassign}>转交禁用审批人工单</button>
          </div>
        </div>
        <div className="card-body" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>用户 ID</th><th>名称</th><th>角色</th><th>仓库</th><th>商户</th><th>启用</th><th>操作</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.id}</td>
                  <td><input className="input" value={user.name} onChange={(e) => update(user.id, { name: e.target.value })} /></td>
                  <td><select className="select" value={user.role} onChange={(e) => update(user.id, { role: e.target.value })}>
                    <option value="operator">操作员</option>
                    <option value="qc_supervisor">品控主管</option>
                    <option value="level1_approver">一级审批</option>
                    <option value="level2_approver">二级审批</option>
                    <option value="admin">管理员</option>
                  </select></td>
                  <td><input className="input" value={user.warehouseId} onChange={(e) => update(user.id, { warehouseId: e.target.value })} /></td>
                  <td><input className="input" value={user.merchantId} onChange={(e) => update(user.id, { merchantId: e.target.value })} /></td>
                  <td><input type="checkbox" checked={user.enabled} onChange={(e) => update(user.id, { enabled: e.target.checked })} /></td>
                  <td><button className="btn btn-primary" onClick={() => save(user)}>保存</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

