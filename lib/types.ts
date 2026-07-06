export type TicketSource = "manual" | "scan";

export type ExceptionCategory = "logistics" | "quality";

export type LogisticsExceptionType =
  | "lost"
  | "damaged"
  | "rejected"
  | "timeout"
  | "address_error";

export type QualityExceptionType =
  | "quantity_mismatch"
  | "appearance_damage"
  | "spec_mismatch"
  | "label_error"
  | "batch_abnormal";

export type ExceptionType = LogisticsExceptionType | QualityExceptionType;

export type TicketStatus =
  | "pending"
  | "level1_review"
  | "level2_review"
  | "rejected"
  | "executing"
  | "completed"
  | "closed";

export type ScanStatus = "recorded" | "passed" | "held" | "released" | "escalated";

export type ApprovalLevel = "level1" | "level2" | "system";

export type ApprovalResult = "approved" | "rejected" | "resubmitted" | "fast_released" | "timeout_escalated";

export type PaymentDirection = "pay_customer" | "recover_supplier";

export type InventoryChangeType = "reserve" | "release" | "deduct" | "return_in" | "scrap" | "replenish";

export type UserRole = "operator" | "qc_supervisor" | "level1_approver" | "level2_approver" | "admin";

export interface UserAccount {
  id: string;
  name: string;
  role: UserRole;
  enabled: boolean;
  warehouseId: string;
  merchantId: string;
}

export interface WaybillSnapshot {
  waybillNo: string;
  externalCode: string;
  receiverStore: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  amount: number;
  warehouseId: string;
  merchantId: string;
  skus: WaybillSku[];
  source: "v2_realtime" | "cache" | "mock";
  syncedAt: string;
}

export interface WaybillSku {
  skuCode: string;
  skuName: string;
  expectedQty: number;
  batchNo: string;
  temperatureLayer: string;
}

export interface SyncLog {
  id: string;
  requestId: string;
  endpoint: string;
  paramsDigest: string;
  statusCode: number;
  success: boolean;
  durationMs: number;
  errorMessage: string;
  createdAt: string;
}

export interface ExceptionTicket {
  id: string;
  source: TicketSource;
  category: ExceptionCategory;
  type: ExceptionType;
  status: TicketStatus;
  waybillNo: string;
  skuCode?: string;
  batchNo?: string;
  amount: number;
  description: string;
  reporterId: string;
  assigneeId?: string;
  assigneeRole: UserRole;
  retryCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  dueAt: string;
  snapshotSource: WaybillSnapshot["source"];
  snapshotSyncedAt: string;
}

export interface ApprovalRecord {
  id: string;
  ticketId: string;
  level: ApprovalLevel;
  actorId: string;
  actorRole: UserRole;
  result: ApprovalResult;
  comment: string;
  fromStatus: TicketStatus;
  toStatus: TicketStatus;
  operationKey: string;
  createdAt: string;
}

export interface CompensationRecord {
  id: string;
  ticketId: string;
  approvalId: string;
  direction: PaymentDirection;
  amount: number;
  status: "created" | "reconciled" | "cancelled";
  createdAt: string;
}

export interface InventoryRecord {
  id: string;
  ticketId: string;
  approvalId: string;
  skuCode: string;
  batchNo: string;
  changeType: InventoryChangeType;
  qty: number;
  createdAt: string;
}

export interface InventoryBatch {
  id: string;
  skuCode: string;
  batchNo: string;
  totalQty: number;
  availableQty: number;
  lockedQty: number;
  status: "available" | "locked" | "scrapped";
  updatedAt: string;
}

export interface InventoryLock {
  id: string;
  ticketId: string;
  skuCode: string;
  batchNo: string;
  qty: number;
  status: "locked" | "released" | "consumed";
  reason: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScanRecord {
  id: string;
  ticketId?: string;
  waybillNo: string;
  skuCode: string;
  batchNo: string;
  operatorId: string;
  deviceId: string;
  status: ScanStatus;
  matchedRuleId?: string;
  decisionReason: string;
  description: string;
  createdAt: string;
}

export interface QcRule {
  id: string;
  name: string;
  subtype: QualityExceptionType;
  severity: "low" | "medium" | "high";
  conditionType: "quantity_delta_percent" | "damage_level" | "spec_mismatch" | "label_mismatch" | "batch_risk";
  threshold: number;
  autoCreateTicket: boolean;
  approvalEntry: "level1" | "level2";
  enabled: boolean;
}

export interface ApprovalRule {
  id: string;
  name: string;
  minAmount: number;
  targetLevel: "level1" | "level2";
  timeoutHours: number;
  maxResubmitCount: number;
  enabled: boolean;
}
