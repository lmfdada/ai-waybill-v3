"use client";

import { useState } from "react";

export default function ScanPage() {
  const [form, setForm] = useState({
    waybillNo: "JT202607060001",
    skuCode: "SKU-DRY-001",
    quantityDeltaPercent: "12",
    damageLevel: "0",
    description: "扫描数量与录单数量存在差异",
  });
  const [result, setResult] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setResult("");
    const res = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": "operator-a", "x-user-role": "operator" },
      body: JSON.stringify({
        ...form,
        quantityDeltaPercent: Number(form.quantityDeltaPercent),
        damageLevel: Number(form.damageLevel),
      }),
    });
    const json = await res.json();
    setResult(JSON.stringify(json, null, 2));
    setLoading(false);
  }

  async function suggest() {
    const res = await fetch("/api/ai/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: form.description, amount: 0 }),
    });
    const json = await res.json();
    setSuggestion(JSON.stringify(json, null, 2));
  }

  return (
    <div className="grid">
      <section className="card" style={{ gridColumn: "span 5" }}>
        <div className="card-header">
          <div className="card-title">扫描录入与品控检测</div>
          <span className="tag">模拟扫描枪</span>
        </div>
        <div className="card-body">
          <label className="form-row">
            <span>运单号</span>
            <input className="input" value={form.waybillNo} onChange={(e) => setForm({ ...form, waybillNo: e.target.value })} />
          </label>
          <label className="form-row">
            <span>SKU</span>
            <input className="input" value={form.skuCode} onChange={(e) => setForm({ ...form, skuCode: e.target.value })} />
          </label>
          <label className="form-row">
            <span>数量差异 %</span>
            <input className="input" value={form.quantityDeltaPercent} onChange={(e) => setForm({ ...form, quantityDeltaPercent: e.target.value })} />
          </label>
          <label className="form-row">
            <span>破损等级</span>
            <input className="input" value={form.damageLevel} onChange={(e) => setForm({ ...form, damageLevel: e.target.value })} />
          </label>
          <label className="form-row">
            <span>描述</span>
            <textarea className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={suggest}>AI 建议</button>
            <button className="btn btn-primary" onClick={submit} disabled={loading}>{loading ? "检测中..." : "提交扫描"}</button>
          </div>
          {suggestion && <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "#fafafa", padding: 10, border: "1px solid var(--border-light)", marginTop: 12 }}>{suggestion}</pre>}
        </div>
      </section>

      <section className="card" style={{ gridColumn: "span 7" }}>
        <div className="card-header">
          <div className="card-title">判定结果</div>
          <span className="tag-warning">命中规则会自动暂扣</span>
        </div>
        <div className="card-body">
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12, color: "var(--text)" }}>
            {result || "提交后显示 V2 校验、命中规则、扫描记录与工单创建结果。重复扫描同一未关闭批次会走幂等追加。"}
          </pre>
        </div>
      </section>
    </div>
  );
}
