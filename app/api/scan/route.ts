import { NextRequest, NextResponse } from "next/server";
import { currentUser, flushWrites, getOpenQualityTicketForBatch, getOpenTicketForBatch, hydrateStore, runAtomic } from "@/lib/store";
import { validateSkuFromV2 } from "@/lib/v2-client";
import { addScanRecord, createQualityTicket, findQcRule } from "@/lib/workflow";

export async function POST(request: NextRequest) {
  await hydrateStore();
  const user = currentUser(request.headers);
  const body = await request.json();
  const waybillNo = String(body.waybillNo || "").trim();
  const skuCode = String(body.skuCode || "").trim();
  const description = String(body.description || "").trim();
  const quantityDeltaPercent = Number(body.quantityDeltaPercent || 0);
  const damageLevel = Number(body.damageLevel || 0);
  const specMatched = body.specMatched !== false;
  const labelMatched = body.labelMatched !== false;
  const batchRisk = Number(body.batchRisk || 0);

  if (!waybillNo || !skuCode) {
    return NextResponse.json({ success: false, message: "请填写运单号和 SKU" }, { status: 400 });
  }

  const validation = await validateSkuFromV2(waybillNo, skuCode);
  if (!validation.data || !validation.data.valid || !validation.data.sku || !validation.data.waybill) {
    return NextResponse.json({
      success: false,
      message: "SKU 不属于该运单或运单不存在",
      requestId: validation.requestId,
      warning: validation.warning,
    }, { status: 400 });
  }

  const sku = validation.data.sku;
  const existing = getOpenTicketForBatch(waybillNo, skuCode, sku.batchNo);
  const lockedByOtherWaybill = getOpenQualityTicketForBatch(skuCode, sku.batchNo);
  if (lockedByOtherWaybill && lockedByOtherWaybill.waybillNo !== waybillNo) {
    return NextResponse.json({
      success: false,
      message: `批次 ${sku.batchNo} 已被运单 ${lockedByOtherWaybill.waybillNo} 的未关闭品控工单锁定，禁止其他运单引用`,
      data: { ticket: lockedByOtherWaybill },
    }, { status: 409 });
  }
  const rule = findQcRule({ quantityDeltaPercent, damageLevel, specMatched, labelMatched, batchRisk });

  if (existing) {
    const scan = await runAtomic(() => addScanRecord({
      ticketId: existing.id,
      waybillNo,
      skuCode,
      batchNo: sku.batchNo,
      operatorId: user.id,
      deviceId: "manual-input",
      status: "held",
      matchedRuleId: existing.id,
      decisionReason: "该批次已存在未关闭品控工单，重复扫描仅追加记录",
      description,
    }));
    await flushWrites();
    return NextResponse.json({ success: true, message: "该批次已存在未关闭品控工单", data: { scan, ticket: existing, idempotent: true } });
  }

  if (!rule) {
    const scan = await runAtomic(() => addScanRecord({
      waybillNo,
      skuCode,
      batchNo: sku.batchNo,
      operatorId: user.id,
      deviceId: "manual-input",
      status: "passed",
      decisionReason: "未命中品控异常规则，允许出库",
      description,
    }));
    await flushWrites();
    return NextResponse.json({ success: true, message: "扫描通过", data: { scan, source: validation.source, warning: validation.warning } });
  }

  const { ticket, created, blocked, message, scan } = await runAtomic(() => {
    const quality = createQualityTicket({
      snapshot: validation.data!.waybill!,
      skuCode,
      batchNo: sku.batchNo,
      operatorId: user.id,
      description: description || rule.name,
      rule,
    });
    if (quality.blocked) return { ...quality, scan: null };
    const record = addScanRecord({
      ticketId: quality.ticket.id,
      waybillNo,
      skuCode,
      batchNo: sku.batchNo,
      operatorId: user.id,
      deviceId: "manual-input",
      status: "held",
      matchedRuleId: rule.id,
      decisionReason: `命中规则：${rule.name}`,
      description,
    });
    return { ...quality, scan: record };
  });

  await flushWrites();
  return NextResponse.json(
    { success: !blocked, message: message || (created ? "命中品控规则，已暂扣并创建工单" : "已追加扫描记录"), data: { scan, ticket, rule } },
    { status: blocked ? 409 : 200 }
  );
}
