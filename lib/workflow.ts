import {
  addApproval,
  addCompensation,
  addInventoryRecord,
  addScan,
  addTicket,
  db,
  findEnabledUserByRole,
  getOpenTicketForBatch,
  lockInventory,
  makeId,
  releaseInventoryLock,
  saveTicket,
} from "./store";
import type {
  ApprovalRecord,
  ExceptionTicket,
  InventoryRecord,
  PaymentDirection,
  QcRule,
  ScanRecord,
  TicketStatus,
  UserRole,
  WaybillSnapshot,
} from "./types";

const now = () => new Date().toISOString();

export function chooseApprovalEntry(amount: number, forcedLevel?: "level1" | "level2") {
  if (forcedLevel) return forcedLevel === "level2" ? "level2_review" : "level1_review";
  const rules = db().approvalRules.filter((rule) => rule.enabled).sort((a, b) => b.minAmount - a.minAmount);
  const hit = rules.find((rule) => amount >= rule.minAmount);
  return hit?.targetLevel === "level2" ? "level2_review" : "level1_review";
}

export function findQcRule(input: {
  quantityDeltaPercent: number;
  damageLevel: number;
  specMatched: boolean;
  labelMatched: boolean;
  batchRisk: number;
}) {
  const rules = db().qcRules.filter((rule) => rule.enabled);
  return rules.find((rule) => {
    if (rule.conditionType === "quantity_delta_percent") return input.quantityDeltaPercent >= rule.threshold;
    if (rule.conditionType === "damage_level") return input.damageLevel >= rule.threshold;
    if (rule.conditionType === "spec_mismatch") return !input.specMatched;
    if (rule.conditionType === "label_mismatch") return !input.labelMatched;
    if (rule.conditionType === "batch_risk") return input.batchRisk >= rule.threshold;
    return false;
  });
}

export function createQualityTicket(params: {
  snapshot: WaybillSnapshot;
  skuCode: string;
  batchNo: string;
  operatorId: string;
  description: string;
  rule: QcRule;
}) {
  const existing = getOpenTicketForBatch(params.snapshot.waybillNo, params.skuCode, params.batchNo);
  if (existing) return { ticket: existing, created: false };

  const status = chooseApprovalEntry(params.snapshot.amount, params.rule.approvalEntry);
  const assigneeRole = status === "level2_review" ? "level2_approver" : "level1_approver";
  const assignee = findEnabledUserByRole(assigneeRole, params.operatorId);
  const ticket: ExceptionTicket = {
    id: makeId("TQ"),
    source: "scan",
    category: "quality",
    type: params.rule.subtype,
    status,
    waybillNo: params.snapshot.waybillNo,
    skuCode: params.skuCode,
    batchNo: params.batchNo,
    amount: params.snapshot.amount,
    description: params.description,
    reporterId: params.operatorId,
    assigneeId: assignee?.id,
    assigneeRole,
    retryCount: 0,
    version: 1,
    createdAt: now(),
    updatedAt: now(),
    dueAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    snapshotSource: params.snapshot.source,
    snapshotSyncedAt: params.snapshot.syncedAt,
  };
  addTicket(ticket);
  lockInventory({
    ticketId: ticket.id,
    skuCode: params.skuCode,
    batchNo: params.batchNo,
    qty: 1,
    reason: `品控暂扣：${params.rule.name}`,
  });
  return { ticket, created: true };
}

export function addScanRecord(record: Omit<ScanRecord, "id" | "createdAt">) {
  const scan = { ...record, id: makeId("SCAN"), createdAt: now() };
  addScan(scan);
  return scan;
}

export function createManualTicket(params: {
  snapshot: WaybillSnapshot;
  type: ExceptionTicket["type"];
  amount: number;
  description: string;
  reporterId: string;
}) {
  const duplicate = db().tickets.find(
    (ticket) =>
      ticket.source === "manual" &&
      ticket.type === params.type &&
      ticket.waybillNo === params.snapshot.waybillNo &&
      !["completed", "closed"].includes(ticket.status)
  );
  if (duplicate) return { ticket: duplicate, created: false };

  const status = chooseApprovalEntry(params.amount);
  const assigneeRole = status === "level2_review" ? "level2_approver" : "level1_approver";
  const assignee = findEnabledUserByRole(assigneeRole, params.reporterId);
  const ticket: ExceptionTicket = {
    id: makeId("TL"),
    source: "manual",
    category: "logistics",
    type: params.type,
    status,
    waybillNo: params.snapshot.waybillNo,
    amount: params.amount,
    description: params.description,
    reporterId: params.reporterId,
    assigneeId: assignee?.id,
    assigneeRole,
    retryCount: 0,
    version: 1,
    createdAt: now(),
    updatedAt: now(),
    dueAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    snapshotSource: params.snapshot.source,
    snapshotSyncedAt: params.snapshot.syncedAt,
  };
  addTicket(ticket);
  return { ticket, created: true };
}

function canApprove(role: UserRole, status: TicketStatus) {
  if (role === "admin") return true;
  if (status === "level1_review") return role === "level1_approver";
  if (status === "level2_review") return role === "level2_approver";
  return false;
}

function addExecutionRecords(ticket: ExceptionTicket, approval: ApprovalRecord) {
  const skuCode = ticket.skuCode || "SKU-AUTO";
  const batchNo = ticket.batchNo || "BATCH-AUTO";
  const inventory: InventoryRecord[] = [];
  let direction: PaymentDirection | null = null;
  let compensationAmount = ticket.amount;

  if (ticket.category === "quality") {
    direction = ticket.type === "label_error" ? null : "recover_supplier";
    if (ticket.type === "quantity_mismatch") {
      releaseInventoryLock(ticket.id, "release");
      inventory.push({ id: makeId("INV"), ticketId: ticket.id, approvalId: approval.id, skuCode, batchNo, changeType: "release", qty: 1, createdAt: now() });
    } else if (ticket.type === "appearance_damage") {
      releaseInventoryLock(ticket.id, "consume");
      inventory.push({ id: makeId("INV"), ticketId: ticket.id, approvalId: approval.id, skuCode, batchNo, changeType: "return_in", qty: 1, createdAt: now() });
    } else if (ticket.type === "spec_mismatch" || ticket.type === "batch_abnormal") {
      releaseInventoryLock(ticket.id, "consume");
      inventory.push({ id: makeId("INV"), ticketId: ticket.id, approvalId: approval.id, skuCode, batchNo, changeType: "scrap", qty: 1, createdAt: now() });
      inventory.push({ id: makeId("INV"), ticketId: ticket.id, approvalId: approval.id, skuCode, batchNo, changeType: "replenish", qty: 1, createdAt: now() });
    } else if (ticket.type === "label_error") {
      releaseInventoryLock(ticket.id, "release");
      inventory.push({ id: makeId("INV"), ticketId: ticket.id, approvalId: approval.id, skuCode, batchNo, changeType: "release", qty: 1, createdAt: now() });
    }
  } else if (ticket.type === "lost") {
    direction = "pay_customer";
    inventory.push({ id: makeId("INV"), ticketId: ticket.id, approvalId: approval.id, skuCode, batchNo, changeType: "deduct", qty: 1, createdAt: now() });
  } else if (ticket.type === "damaged") {
    direction = "pay_customer";
    inventory.push({ id: makeId("INV"), ticketId: ticket.id, approvalId: approval.id, skuCode, batchNo, changeType: "return_in", qty: 1, createdAt: now() });
    inventory.push({ id: makeId("INV"), ticketId: ticket.id, approvalId: approval.id, skuCode, batchNo, changeType: "deduct", qty: 1, createdAt: now() });
  } else if (ticket.type === "rejected") {
    compensationAmount = 0;
    inventory.push({ id: makeId("INV"), ticketId: ticket.id, approvalId: approval.id, skuCode, batchNo, changeType: "return_in", qty: 1, createdAt: now() });
  } else if (ticket.type === "timeout") {
    direction = "pay_customer";
    compensationAmount = Math.round(ticket.amount * 0.2);
  } else if (ticket.type === "address_error") {
    inventory.push({ id: makeId("INV"), ticketId: ticket.id, approvalId: approval.id, skuCode, batchNo, changeType: "deduct", qty: 1, createdAt: now() });
  }

  if (direction && compensationAmount > 0) {
    addCompensation({
      id: makeId("PAY"),
      ticketId: ticket.id,
      approvalId: approval.id,
      direction,
      amount: compensationAmount,
      status: "created",
      createdAt: now(),
    });
  }
  inventory.forEach((record) => addInventoryRecord(record));
}

export function approveTicket(params: {
  ticketId: string;
  actorId: string;
  actorRole: UserRole;
  result: "approved" | "rejected";
  comment: string;
  expectedVersion: number;
  operationKey: string;
}) {
  const ticket = db().tickets.find((item) => item.id === params.ticketId);
  if (!ticket) return { ok: false, message: "工单不存在" };
  if (ticket.version !== params.expectedVersion) return { ok: false, message: "该工单已被处理，请刷新" };
  if (ticket.reporterId === params.actorId) return { ok: false, message: "上报人不能审批自己提交的工单" };
  if (!canApprove(params.actorRole, ticket.status)) return { ok: false, message: "当前角色无权审批该层级工单" };
  if (ticket.assigneeId && ticket.assigneeId !== params.actorId && params.actorRole !== "admin") return { ok: false, message: "该工单已分配给其他审批人" };
  if (db().approvals.some((item) => item.operationKey === params.operationKey)) return { ok: true, message: "重复操作已忽略", ticket };

  const fromStatus = ticket.status;
  let toStatus: TicketStatus = "executing";
  if (params.result === "rejected") {
    toStatus = ticket.retryCount >= 2 ? "closed" : "rejected";
    ticket.retryCount += 1;
  } else if (fromStatus === "level1_review" && ticket.amount >= 3000) {
    toStatus = "level2_review";
    ticket.assigneeRole = "level2_approver";
    ticket.assigneeId = findEnabledUserByRole("level2_approver", ticket.reporterId)?.id;
  }

  const approval: ApprovalRecord = {
    id: makeId("APV"),
    ticketId: ticket.id,
    level: fromStatus === "level2_review" ? "level2" : "level1",
    actorId: params.actorId,
    actorRole: params.actorRole,
    result: params.result,
    comment: params.comment,
    fromStatus,
    toStatus,
    operationKey: params.operationKey,
    createdAt: now(),
  };
  addApproval(approval);

  ticket.status = toStatus;
  ticket.version += 1;
  ticket.updatedAt = now();
  saveTicket(ticket);
  if (toStatus === "executing") {
    addExecutionRecords(ticket, approval);
    ticket.status = "completed";
    ticket.version += 1;
    ticket.updatedAt = now();
    saveTicket(ticket);
  }
  return { ok: true, message: "审批完成", ticket };
}

export function fastRelease(ticketId: string, actorId: string, actorRole: UserRole, reason: string) {
  const ticket = db().tickets.find((item) => item.id === ticketId);
  if (!ticket) return { ok: false, message: "工单不存在" };
  if (actorRole !== "qc_supervisor" && actorRole !== "admin") return { ok: false, message: "仅品控主管可快速放行" };
  if (ticket.category !== "quality") return { ok: false, message: "快速放行只适用于品控异常" };
  const fromStatus = ticket.status;
  ticket.status = "completed";
  ticket.version += 1;
  ticket.updatedAt = now();
  releaseInventoryLock(ticket.id, "release");
  saveTicket(ticket);
  addApproval({
    id: makeId("APV"),
    ticketId: ticket.id,
    level: "system",
    actorId,
    actorRole,
    result: "fast_released",
    comment: reason,
    fromStatus,
    toStatus: "completed",
    operationKey: makeId("fast"),
    createdAt: now(),
  });
  return { ok: true, message: "已快速放行并关闭工单", ticket };
}

export function processTimeouts() {
  const affected: string[] = [];
  const current = Date.now();
  const candidates = db().tickets.filter(
    (ticket) =>
      ["pending", "level1_review", "level2_review"].includes(ticket.status) &&
      new Date(ticket.dueAt).getTime() <= current
  );

  for (const ticket of candidates) {
    const fromStatus = ticket.status;
    let toStatus: TicketStatus = "level2_review";
    let result: ApprovalRecord["result"] = "timeout_escalated";
    let comment = "超时未处理，系统自动升级二级审批";

    if (fromStatus === "level2_review") {
      toStatus = "closed";
      result = "rejected";
      comment = "二级审批超时，系统自动驳回关闭";
    }

    ticket.status = toStatus;
    ticket.assigneeRole = toStatus === "level2_review" ? "level2_approver" : ticket.assigneeRole;
    ticket.version += 1;
    ticket.updatedAt = now();
    ticket.dueAt = toStatus === "level2_review"
      ? new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
      : ticket.dueAt;
    saveTicket(ticket);

    addApproval({
      id: makeId("APV"),
      ticketId: ticket.id,
      level: "system",
      actorId: "system-timeout-job",
      actorRole: "admin",
      result,
      comment,
      fromStatus,
      toStatus,
      operationKey: `timeout-${ticket.id}-${ticket.version}`,
      createdAt: now(),
    });
    affected.push(ticket.id);
  }

  return affected;
}

export function reassignDisabledApprovals(actorId = "system-reassign-job") {
  const affected: string[] = [];
  const tickets = db().tickets.filter(
    (ticket) =>
      ["pending", "level1_review", "level2_review"].includes(ticket.status) &&
      ticket.assigneeId &&
      db().users.some((user) => user.id === ticket.assigneeId && !user.enabled)
  );

  for (const ticket of tickets) {
    const fromStatus = ticket.status;
    const previousAssignee = ticket.assigneeId || "";
    const next = findEnabledUserByRole(ticket.assigneeRole, ticket.reporterId);
    if (!next) continue;

    ticket.assigneeId = next.id;
    ticket.version += 1;
    ticket.updatedAt = now();
    saveTicket(ticket);
    addApproval({
      id: makeId("APV"),
      ticketId: ticket.id,
      level: "system",
      actorId,
      actorRole: "admin",
      result: "resubmitted",
      comment: `审批人 ${previousAssignee} 已禁用，系统转交给 ${next.id}`,
      fromStatus,
      toStatus: ticket.status,
      operationKey: `reassign-${ticket.id}-${ticket.version}`,
      createdAt: now(),
    });
    affected.push(ticket.id);
  }

  return affected;
}
