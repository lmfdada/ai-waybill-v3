import { addSyncLog, getSnapshot } from "./store";
import type { WaybillSnapshot } from "./types";

type V2Result<T> = {
  data: T | null;
  requestId: string;
  source: WaybillSnapshot["source"];
  warning?: string;
};

const V2_TIMEOUT_MS = 2500;

function requestId() {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), V2_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callV2<T>(endpoint: string, paramsDigest: string, fallback: () => T | null): Promise<V2Result<T>> {
  const rid = requestId();
  const started = Date.now();
  const baseUrl = process.env.V2_API_BASE_URL;

  if (!baseUrl) {
    const data = fallback();
    addSyncLog({
      requestId: rid,
      endpoint,
      paramsDigest,
      statusCode: data ? 206 : 503,
      success: !!data,
      durationMs: Date.now() - started,
      errorMessage: "V2_API_BASE_URL 未配置，使用本地缓存/演示数据降级",
    });
    return { data, requestId: rid, source: data ? "cache" : "mock", warning: "V2 未配置，当前使用本地缓存数据" };
  }

  const url = `${baseUrl}${endpoint}`;
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetchWithTimeout(url, {
        headers: {
          "x-api-key": process.env.V2_API_KEY || "dev-v2-api-key",
          "x-request-id": rid,
        },
      });
      const durationMs = Date.now() - started;
      if (!res.ok) {
        lastError = `V2 返回 ${res.status}`;
        addSyncLog({ requestId: rid, endpoint, paramsDigest, statusCode: res.status, success: false, durationMs, errorMessage: lastError });
        continue;
      }
      const json = await res.json();
      addSyncLog({ requestId: rid, endpoint, paramsDigest, statusCode: res.status, success: true, durationMs, errorMessage: "" });
      return { data: (json.data ?? json) as T, requestId: json.requestId || rid, source: "v2_realtime" };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  const data = fallback();
  addSyncLog({
    requestId: rid,
    endpoint,
    paramsDigest,
    statusCode: data ? 206 : 504,
    success: !!data,
    durationMs: Date.now() - started,
    errorMessage: data ? `V2 调用失败，已降级缓存：${lastError}` : `V2 调用失败且无缓存：${lastError}`,
  });
  return {
    data,
    requestId: rid,
    source: data ? "cache" : "mock",
    warning: data ? "V2 暂不可用，当前展示本地缓存数据" : "V2 暂不可用，且未找到本地缓存",
  };
}

export async function getWaybillFromV2(waybillNo: string) {
  return callV2<WaybillSnapshot>(
    `/api/v2/waybills/${encodeURIComponent(waybillNo)}`,
    `waybillNo=${waybillNo}`,
    () => getSnapshot(waybillNo) || null
  );
}

export async function validateSkuFromV2(waybillNo: string, skuCode: string) {
  const endpoint = `/api/v2/waybills/${encodeURIComponent(waybillNo)}/skus/${encodeURIComponent(skuCode)}`;
  const direct = await callV2<{ valid: boolean; sku: WaybillSnapshot["skus"][number] | null; waybill: WaybillSnapshot | null }>(
    endpoint,
    `waybillNo=${waybillNo}&skuCode=${skuCode}`,
    () => {
      const snapshot = getSnapshot(waybillNo);
      const sku = snapshot?.skus.find((item) => item.skuCode === skuCode) || null;
      return { valid: !!sku, sku, waybill: snapshot || null };
    }
  );
  if (direct.data) return direct;

  const result = await getWaybillFromV2(waybillNo);
  const sku = result.data?.skus.find((item) => item.skuCode === skuCode) || null;
  return {
    ...result,
    data: sku ? { valid: true, sku, waybill: result.data } : { valid: false, sku: null, waybill: result.data },
  };
}
