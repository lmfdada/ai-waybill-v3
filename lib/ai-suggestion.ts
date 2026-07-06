import { db } from "./store";
import type { ExceptionTicket } from "./types";

export type AiSuggestion = {
  type: ExceptionTicket["type"];
  severity: "low" | "medium" | "high";
  approvalOpinion: string;
  basis: string[];
  source: "heuristic" | "ai";
  warning?: string;
};

const keywordType: Array<[ExceptionTicket["type"], string[]]> = [
  ["lost", ["丢", "遗失", "无下文", "找不到"]],
  ["damaged", ["破损", "损坏", "坏了", "外包装"]],
  ["rejected", ["拒收", "拒签", "不要"]],
  ["timeout", ["超时", "延误", "未签收"]],
  ["address_error", ["地址", "改址", "错址"]],
  ["quantity_mismatch", ["数量", "少发", "多发", "差异"]],
  ["appearance_damage", ["外观", "破损", "划痕"]],
  ["spec_mismatch", ["规格", "型号", "不符"]],
  ["label_error", ["标签", "条码", "贴错"]],
  ["batch_abnormal", ["批次", "风险", "异常批"]],
];

function heuristic(text: string, amount: number): AiSuggestion {
  const type = keywordType.find(([, words]) => words.some((word) => text.includes(word)))?.[0] || "damaged";
  const severity = amount >= 3000 || ["lost", "batch_abnormal", "spec_mismatch"].includes(type) ? "high" : amount >= 1000 ? "medium" : "low";
  const similar = db().approvals
    .filter((approval) => approval.result === "approved")
    .slice(0, 3)
    .map((approval) => `参考历史审批 ${approval.id}：${approval.comment || approval.result}`);

  return {
    type,
    severity,
    approvalOpinion: severity === "high"
      ? "建议进入二级审批，先冻结相关批次或联动承运商核查，审批通过后按策略执行赔付/库存联动。"
      : "建议一级审批处理，补充凭证后按异常类型执行对应动作。",
    basis: similar.length > 0
      ? similar
      : ["基于异常描述关键词、工单金额和当前执行策略生成兜底建议"],
    source: "heuristic",
    warning: "未调用外部 AI，当前为规则化兜底建议",
  };
}

export async function suggestException(input: { text: string; amount: number }): Promise<AiSuggestion> {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "";
  if (!apiKey) return heuristic(input.text, input.amount);

  const fallback = heuristic(input.text, input.amount);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(process.env.AI_BASE_URL || "https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "deepseek-chat",
        temperature: 0.2,
        messages: [
          { role: "system", content: "你是运单异常审批助手。只输出 JSON。" },
          {
            role: "user",
            content: `异常描述：${input.text}\n金额：${input.amount}\n请输出 JSON: {"type":"lost|damaged|rejected|timeout|address_error|quantity_mismatch|appearance_damage|spec_mismatch|label_error|batch_abnormal","severity":"low|medium|high","approvalOpinion":"...","basis":["..."]}`,
          },
        ],
      }),
    });
    if (!res.ok) return { ...fallback, warning: `AI 服务返回 ${res.status}，已使用兜底建议` };
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(String(content).replace(/```json|```/g, "").trim()) as Partial<AiSuggestion>;
    return {
      type: parsed.type || fallback.type,
      severity: parsed.severity || fallback.severity,
      approvalOpinion: parsed.approvalOpinion || fallback.approvalOpinion,
      basis: Array.isArray(parsed.basis) && parsed.basis.length > 0 ? parsed.basis : fallback.basis,
      source: "ai",
    };
  } catch {
    return { ...fallback, warning: "AI 服务超时或异常，已使用兜底建议" };
  } finally {
    clearTimeout(timer);
  }
}

