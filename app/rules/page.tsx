"use client";

import { useEffect, useState } from "react";

type QcRule = {
  id: string;
  name: string;
  subtype: string;
  severity: string;
  conditionType: string;
  threshold: number;
  approvalEntry: "level1" | "level2";
  enabled: boolean;
};

type ApprovalRule = {
  id: string;
  name: string;
  minAmount: number;
  targetLevel: "level1" | "level2";
  timeoutHours: number;
  maxResubmitCount: number;
  enabled: boolean;
};

export default function RulesPage() {
  const [qcRules, setQcRules] = useState<QcRule[]>([]);
  const [approvalRules, setApprovalRules] = useState<ApprovalRule[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const [qcRes, approvalRes] = await Promise.all([
      fetch("/api/rules/qc"),
      fetch("/api/rules/approval"),
    ]);
    const qcJson = await qcRes.json();
    const approvalJson = await approvalRes.json();
    setQcRules(qcJson.data || []);
    setApprovalRules(approvalJson.data || []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function saveQc(rule: QcRule) {
    const res = await fetch("/api/rules/qc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rule),
    });
    const json = await res.json();
    setMessage(json.success ? "品控规则已保存" : "保存失败");
    await load();
  }

  async function saveApproval(rule: ApprovalRule) {
    const res = await fetch("/api/rules/approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rule),
    });
    const json = await res.json();
    setMessage(json.success ? "审批规则已保存" : "保存失败");
    await load();
  }

  function updateQc(id: string, patch: Partial<QcRule>) {
    setQcRules((prev) => prev.map((rule) => rule.id === id ? { ...rule, ...patch } : rule));
  }

  function updateApproval(id: string, patch: Partial<ApprovalRule>) {
    setApprovalRules((prev) => prev.map((rule) => rule.id === id ? { ...rule, ...patch } : rule));
  }

  return (
    <div className="grid">
      <section className="card" style={{ gridColumn: "span 12" }}>
        <div className="card-header">
          <div>
            <div className="card-title">审批分级规则</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>金额阈值、超时时长、重提次数均可配置，不写死在代码里。</div>
          </div>
          {message && <span className="tag">{message}</span>}
        </div>
        <div className="card-body" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>名称</th><th>最低金额</th><th>目标层级</th><th>超时小时</th><th>重提上限</th><th>启用</th><th>操作</th></tr></thead>
            <tbody>
              {approvalRules.map((rule) => (
                <tr key={rule.id}>
                  <td><input className="input" value={rule.name} onChange={(e) => updateApproval(rule.id, { name: e.target.value })} /></td>
                  <td><input className="input" type="number" value={rule.minAmount} onChange={(e) => updateApproval(rule.id, { minAmount: Number(e.target.value) })} /></td>
                  <td><select className="select" value={rule.targetLevel} onChange={(e) => updateApproval(rule.id, { targetLevel: e.target.value as "level1" | "level2" })}><option value="level1">一级</option><option value="level2">二级</option></select></td>
                  <td><input className="input" type="number" value={rule.timeoutHours} onChange={(e) => updateApproval(rule.id, { timeoutHours: Number(e.target.value) })} /></td>
                  <td><input className="input" type="number" value={rule.maxResubmitCount} onChange={(e) => updateApproval(rule.id, { maxResubmitCount: Number(e.target.value) })} /></td>
                  <td><input type="checkbox" checked={rule.enabled} onChange={(e) => updateApproval(rule.id, { enabled: e.target.checked })} /></td>
                  <td><button className="btn btn-primary" onClick={() => saveApproval(rule)}>保存</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ gridColumn: "span 12" }}>
        <div className="card-header">
          <div>
            <div className="card-title">品控触发规则</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>扫描后根据这些规则判定是否暂扣、创建工单以及进入哪个审批层级。</div>
          </div>
        </div>
        <div className="card-body" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>名称</th><th>子类型</th><th>条件</th><th>阈值</th><th>严重度</th><th>进入层级</th><th>启用</th><th>操作</th></tr></thead>
            <tbody>
              {qcRules.map((rule) => (
                <tr key={rule.id}>
                  <td><input className="input" value={rule.name} onChange={(e) => updateQc(rule.id, { name: e.target.value })} /></td>
                  <td><select className="select" value={rule.subtype} onChange={(e) => updateQc(rule.id, { subtype: e.target.value })}>
                    <option value="quantity_mismatch">数量不符</option>
                    <option value="appearance_damage">外观破损</option>
                    <option value="spec_mismatch">规格不符</option>
                    <option value="label_error">标签错误</option>
                    <option value="batch_abnormal">批次异常</option>
                  </select></td>
                  <td><select className="select" value={rule.conditionType} onChange={(e) => updateQc(rule.id, { conditionType: e.target.value })}>
                    <option value="quantity_delta_percent">数量差异百分比</option>
                    <option value="damage_level">破损等级</option>
                    <option value="spec_mismatch">规格不匹配</option>
                    <option value="label_mismatch">标签不匹配</option>
                    <option value="batch_risk">批次风险分</option>
                  </select></td>
                  <td><input className="input" type="number" value={rule.threshold} onChange={(e) => updateQc(rule.id, { threshold: Number(e.target.value) })} /></td>
                  <td><select className="select" value={rule.severity} onChange={(e) => updateQc(rule.id, { severity: e.target.value })}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></td>
                  <td><select className="select" value={rule.approvalEntry} onChange={(e) => updateQc(rule.id, { approvalEntry: e.target.value as "level1" | "level2" })}><option value="level1">一级</option><option value="level2">二级</option></select></td>
                  <td><input type="checkbox" checked={rule.enabled} onChange={(e) => updateQc(rule.id, { enabled: e.target.checked })} /></td>
                  <td><button className="btn btn-primary" onClick={() => saveQc(rule)}>保存</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

