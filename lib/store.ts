import type {
  ApprovalRecord,
  ApprovalRule,
  CompensationRecord,
  InventoryBatch,
  InventoryLock,
  ExceptionTicket,
  InventoryRecord,
  QcRule,
  ScanRecord,
  SyncLog,
  UserAccount,
  UserRole,
  WaybillSnapshot,
} from "./types";
import { neon } from "@neondatabase/serverless";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

type Store = {
  snapshots: WaybillSnapshot[];
  syncLogs: SyncLog[];
  tickets: ExceptionTicket[];
  approvals: ApprovalRecord[];
  compensations: CompensationRecord[];
  inventory: InventoryRecord[];
  inventoryBatches: InventoryBatch[];
  inventoryLocks: InventoryLock[];
  scans: ScanRecord[];
  qcRules: QcRule[];
  approvalRules: ApprovalRule[];
  users: UserAccount[];
};

const now = () => new Date().toISOString();

const TABLES = {
  snapshots: "waybill_snapshots",
  syncLogs: "sync_logs",
  tickets: "exception_tickets",
  approvals: "approval_records",
  compensations: "compensation_records",
  inventory: "inventory_records",
  inventoryBatches: "inventory_batches",
  inventoryLocks: "inventory_locks",
  scans: "scan_records",
  qcRules: "qc_rules",
  approvalRules: "approval_rules",
  users: "user_accounts",
} as const;

type TableName = (typeof TABLES)[keyof typeof TABLES];
const PROJECTION_COLUMNS = [
  "waybill_no",
  "ticket_id",
  "approval_id",
  "operation_key",
  "sku_code",
  "batch_no",
  "category",
  "source",
  "type",
  "status",
  "assignee_id",
  "assignee_role",
  "reporter_id",
  "actor_id",
  "actor_role",
  "direction",
  "amount",
  "version",
  "due_at",
  "updated_at",
] as const;
type ProjectionColumn = (typeof PROJECTION_COLUMNS)[number];
type ProjectionValue = string | number | null;
type Projection = Record<ProjectionColumn, ProjectionValue>;
type PersistOp =
  | { kind: "save"; table: string; id: string; value: unknown; createdAt: string }
  | { kind: "delete"; table: string; id: string };

let sqlite: Database.Database | null = null;
function normalizePostgresUrl(value?: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.searchParams.delete("channel_binding");
    return url.toString();
  } catch {
    return value.replace(/([?&])channel_binding=[^&]+&?/, "$1").replace(/[?&]$/, "");
  }
}

const postgresUrl = normalizePostgresUrl(process.env.DATABASE_URL);
const usePostgres = Boolean(postgresUrl);
const pg = postgresUrl ? neon(postgresUrl) : null;
let pgReady: Promise<void> | null = null;
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const pendingWrites: Promise<unknown>[] = [];
let atomicOps: PersistOp[] | null = null;

function tableSql(table: string): TableName {
  if ((Object.values(TABLES) as string[]).includes(table)) return table as TableName;
  throw new Error(`Unknown table: ${table}`);
}

function getSqlite() {
  if (sqlite) return sqlite;
  const dbDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dbDir, { recursive: true });
  sqlite = new Database(path.join(dbDir, "v3.db"));
  sqlite.pragma("journal_mode = WAL");
  for (const table of Object.values(TABLES)) {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }
  ensureSqliteProjectionSchema(sqlite);
  return sqlite;
}

function emptyProjection(): Projection {
  return Object.fromEntries(PROJECTION_COLUMNS.map((column) => [column, null])) as Projection;
}

function projectRecord(table: string, value: unknown): Projection {
  const projection = emptyProjection();
  const record = value as Record<string, unknown>;
  if (table === TABLES.snapshots) {
    projection.waybill_no = String(record.waybillNo || "");
    projection.source = String(record.source || "");
    projection.amount = Number(record.amount || 0);
    projection.updated_at = String(record.syncedAt || "");
  } else if (table === TABLES.tickets) {
    projection.waybill_no = String(record.waybillNo || "");
    projection.ticket_id = String(record.id || "");
    projection.sku_code = record.skuCode ? String(record.skuCode) : null;
    projection.batch_no = record.batchNo ? String(record.batchNo) : null;
    projection.category = String(record.category || "");
    projection.source = String(record.source || "");
    projection.type = String(record.type || "");
    projection.status = String(record.status || "");
    projection.assignee_id = record.assigneeId ? String(record.assigneeId) : null;
    projection.assignee_role = String(record.assigneeRole || "");
    projection.reporter_id = String(record.reporterId || "");
    projection.amount = Number(record.amount || 0);
    projection.version = Number(record.version || 0);
    projection.due_at = String(record.dueAt || "");
    projection.updated_at = String(record.updatedAt || "");
  } else if (table === TABLES.approvals) {
    projection.ticket_id = String(record.ticketId || "");
    projection.operation_key = String(record.operationKey || "");
    projection.status = String(record.toStatus || "");
    projection.actor_id = String(record.actorId || "");
    projection.actor_role = String(record.actorRole || "");
    projection.updated_at = String(record.createdAt || "");
  } else if (table === TABLES.compensations) {
    projection.ticket_id = String(record.ticketId || "");
    projection.approval_id = String(record.approvalId || "");
    projection.direction = String(record.direction || "");
    projection.amount = Number(record.amount || 0);
    projection.status = String(record.status || "");
    projection.updated_at = String(record.createdAt || "");
  } else if (table === TABLES.inventory) {
    projection.ticket_id = String(record.ticketId || "");
    projection.approval_id = String(record.approvalId || "");
    projection.sku_code = String(record.skuCode || "");
    projection.batch_no = String(record.batchNo || "");
    projection.type = String(record.changeType || "");
    projection.updated_at = String(record.createdAt || "");
  } else if (table === TABLES.inventoryBatches) {
    projection.sku_code = String(record.skuCode || "");
    projection.batch_no = String(record.batchNo || "");
    projection.status = String(record.status || "");
    projection.amount = Number(record.lockedQty || 0);
    projection.updated_at = String(record.updatedAt || "");
  } else if (table === TABLES.inventoryLocks) {
    projection.ticket_id = String(record.ticketId || "");
    projection.sku_code = String(record.skuCode || "");
    projection.batch_no = String(record.batchNo || "");
    projection.status = String(record.status || "");
    projection.updated_at = String(record.updatedAt || "");
  } else if (table === TABLES.scans) {
    projection.ticket_id = record.ticketId ? String(record.ticketId) : null;
    projection.waybill_no = String(record.waybillNo || "");
    projection.sku_code = String(record.skuCode || "");
    projection.batch_no = String(record.batchNo || "");
    projection.status = String(record.status || "");
    projection.actor_id = String(record.operatorId || "");
    projection.updated_at = String(record.createdAt || "");
  } else if (table === TABLES.users) {
    projection.actor_id = String(record.id || "");
    projection.actor_role = String(record.role || "");
    projection.status = record.enabled === false ? "disabled" : "enabled";
  }
  return projection;
}

function ensureSqliteProjectionSchema(dbh: Database.Database) {
  for (const table of Object.values(TABLES)) {
    const rows = dbh.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    const existing = new Set(rows.map((row) => row.name));
    for (const column of PROJECTION_COLUMNS) {
      if (!existing.has(column)) {
        try {
          dbh.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${column === "amount" || column === "version" ? "REAL" : "TEXT"}`);
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes("duplicate column")) throw error;
        }
      }
    }
  }
  dbh.exec(`
    CREATE INDEX IF NOT EXISTS idx_tickets_workbench ON ${TABLES.tickets} (status, assignee_id, source, type, waybill_no, due_at);
    CREATE INDEX IF NOT EXISTS idx_tickets_batch_lock ON ${TABLES.tickets} (sku_code, batch_no, category, status);
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_approval_operation_key ON ${TABLES.approvals} (operation_key) WHERE operation_key IS NOT NULL AND operation_key != '';
    CREATE INDEX IF NOT EXISTS idx_scans_ticket_batch ON ${TABLES.scans} (ticket_id, sku_code, batch_no, status);
    CREATE INDEX IF NOT EXISTS idx_compensations_trace ON ${TABLES.compensations} (ticket_id, approval_id, direction);
    CREATE INDEX IF NOT EXISTS idx_inventory_trace ON ${TABLES.inventory} (ticket_id, approval_id, sku_code, batch_no);
    CREATE INDEX IF NOT EXISTS idx_locks_open_batch ON ${TABLES.inventoryLocks} (sku_code, batch_no, status);
    CREATE INDEX IF NOT EXISTS idx_sync_logs_time ON ${TABLES.syncLogs} (updated_at, status);
  `);
  backfillSqliteProjections(dbh);
}

function backfillSqliteProjections(dbh: Database.Database) {
  for (const table of Object.values(TABLES)) {
    const rows = dbh.prepare(`SELECT id, data FROM ${table}`).all() as { id: string; data: string }[];
    const stmt = dbh.prepare(`UPDATE ${table} SET ${PROJECTION_COLUMNS.map((column) => `${column} = ?`).join(", ")} WHERE id = ?`);
    const tx = dbh.transaction((records: { id: string; data: string }[]) => {
      for (const row of records) {
        const value = JSON.parse(row.data);
        const projection = projectRecord(table, value);
        stmt.run(...PROJECTION_COLUMNS.map((column) => projection[column]), row.id);
      }
    });
    tx(rows);
  }
}

function loadTable<T>(table: string): T[] {
  if (usePostgres) return [];
  const dbh = getSqlite();
  const rows = dbh.prepare(`SELECT data FROM ${table} ORDER BY created_at DESC`).all() as { data: string }[];
  return rows.map((row) => JSON.parse(row.data) as T);
}

function saveRecord(table: string, id: string, value: unknown) {
  const op: PersistOp = { kind: "save", table, id, value, createdAt: now() };
  if (atomicOps) {
    atomicOps.push(op);
    return;
  }
  persistSave(op);
}

function persistSave(op: Extract<PersistOp, { kind: "save" }>) {
  const projection = projectRecord(op.table, op.value);
  if (usePostgres) {
    enqueuePgWrite(async () => {
      await ensurePostgres();
      await pg!.query(
        `INSERT INTO ${tableSql(op.table)} (
           id, data, created_at, ${PROJECTION_COLUMNS.join(", ")}
         )
         VALUES (
           $1, $2::jsonb, $3, ${PROJECTION_COLUMNS.map((_, index) => `$${index + 4}`).join(", ")}
         )
         ON CONFLICT (id) DO UPDATE SET
           data = EXCLUDED.data,
           created_at = EXCLUDED.created_at,
           ${PROJECTION_COLUMNS.map((column) => `${column} = EXCLUDED.${column}`).join(", ")}`,
        [op.id, JSON.stringify(op.value), op.createdAt, ...PROJECTION_COLUMNS.map((column) => projection[column])]
      );
    });
    return;
  }
  getSqlite()
    .prepare(`INSERT OR REPLACE INTO ${op.table} (id, data, created_at, ${PROJECTION_COLUMNS.join(", ")}) VALUES (?, ?, ?, ${PROJECTION_COLUMNS.map(() => "?").join(", ")})`)
    .run(op.id, JSON.stringify(op.value), op.createdAt, ...PROJECTION_COLUMNS.map((column) => projection[column]));
}

function deleteRecord(table: string, id: string) {
  const op: PersistOp = { kind: "delete", table, id };
  if (atomicOps) {
    atomicOps.push(op);
    return;
  }
  persistDelete(op);
}

function persistDelete(op: Extract<PersistOp, { kind: "delete" }>) {
  if (usePostgres) {
    enqueuePgWrite(async () => {
      await ensurePostgres();
      await pg!.query(`DELETE FROM ${tableSql(op.table)} WHERE id = $1`, [op.id]);
    });
    return;
  }
  getSqlite().prepare(`DELETE FROM ${op.table} WHERE id = ?`).run(op.id);
}

function tableCount(table: string) {
  if (usePostgres) return 0;
  const row = getSqlite().prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number };
  return Number(row.total || 0);
}

function seedRecords<T extends { id?: string; waybillNo?: string }>(
  table: string,
  items: T[],
  idOf: (item: T) => string
) {
  if (usePostgres) return;
  const dbh = getSqlite();
  const stmt = dbh.prepare(`INSERT OR IGNORE INTO ${table} (id, data, created_at, ${PROJECTION_COLUMNS.join(", ")}) VALUES (?, ?, ?, ${PROJECTION_COLUMNS.map(() => "?").join(", ")})`);
  const tx = dbh.transaction((records: T[]) => {
    for (const item of records) {
      const projection = projectRecord(table, item);
      stmt.run(idOf(item), JSON.stringify(item), now(), ...PROJECTION_COLUMNS.map((column) => projection[column]));
    }
  });
  tx(items);
}

async function ensurePostgres() {
  if (!pg) return;
  if (!pgReady) {
    pgReady = (async () => {
      for (const table of Object.values(TABLES)) {
        await pg.query(
          `CREATE TABLE IF NOT EXISTS ${tableSql(table)} (
            id TEXT PRIMARY KEY,
            data JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            waybill_no TEXT,
            ticket_id TEXT,
            approval_id TEXT,
            operation_key TEXT,
            sku_code TEXT,
            batch_no TEXT,
            category TEXT,
            source TEXT,
            type TEXT,
            status TEXT,
            assignee_id TEXT,
            assignee_role TEXT,
            reporter_id TEXT,
            actor_id TEXT,
            actor_role TEXT,
            direction TEXT,
            amount NUMERIC,
            version NUMERIC,
            due_at TEXT,
            updated_at TEXT
          )`
        );
        for (const column of PROJECTION_COLUMNS) {
          await pg.query(`ALTER TABLE ${tableSql(table)} ADD COLUMN IF NOT EXISTS ${column} ${column === "amount" || column === "version" ? "NUMERIC" : "TEXT"}`);
        }
      }
      await pg.query(`CREATE INDEX IF NOT EXISTS idx_tickets_workbench ON ${TABLES.tickets} (status, assignee_id, source, type, waybill_no, due_at)`);
      await pg.query(`CREATE INDEX IF NOT EXISTS idx_tickets_batch_lock ON ${TABLES.tickets} (sku_code, batch_no, category, status)`);
      await pg.query(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_approval_operation_key ON ${TABLES.approvals} (operation_key) WHERE operation_key IS NOT NULL AND operation_key != ''`);
      await pg.query(`CREATE INDEX IF NOT EXISTS idx_scans_ticket_batch ON ${TABLES.scans} (ticket_id, sku_code, batch_no, status)`);
      await pg.query(`CREATE INDEX IF NOT EXISTS idx_compensations_trace ON ${TABLES.compensations} (ticket_id, approval_id, direction)`);
      await pg.query(`CREATE INDEX IF NOT EXISTS idx_inventory_trace ON ${TABLES.inventory} (ticket_id, approval_id, sku_code, batch_no)`);
      await pg.query(`CREATE INDEX IF NOT EXISTS idx_locks_open_batch ON ${TABLES.inventoryLocks} (sku_code, batch_no, status)`);
      await pg.query(`CREATE INDEX IF NOT EXISTS idx_sync_logs_time ON ${TABLES.syncLogs} (updated_at, status)`);
    })();
  }
  await pgReady;
}

async function pgCount(table: string) {
  if (!pg) return 0;
  const rows = await pg.query(`SELECT COUNT(*)::int AS total FROM ${tableSql(table)}`);
  return Number(rows[0]?.total || 0);
}

async function pgSeedRecords<T>(table: string, items: T[], idOf: (item: T) => string) {
  if (!pg) return;
  for (const item of items) {
    await pg.query(
      `INSERT INTO ${tableSql(table)} (id, data, created_at)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (id) DO NOTHING`,
      [idOf(item), JSON.stringify(item), now()]
    );
  }
}

async function pgLoadTable<T>(table: string): Promise<T[]> {
  if (!pg) return [];
  const rows = await pg.query(`SELECT data FROM ${tableSql(table)} ORDER BY created_at DESC`);
  return rows.map((row) => row.data as T);
}

function enqueuePgWrite(write: () => Promise<unknown>) {
  const promise = write().catch((error) => {
    console.error("Postgres write failed", error);
    throw error;
  });
  pendingWrites.push(promise);
}

async function persistAtomicOps(ops: PersistOp[]) {
  if (ops.length === 0) return;
  if (usePostgres) {
    await ensurePostgres();
    const sql = pg as unknown as {
      query: (text: string, values: unknown[]) => unknown;
      transaction: (queries: unknown[]) => Promise<unknown>;
    };
    await sql.transaction(
      ops.map((op) => {
        if (op.kind === "save") {
          const projection = projectRecord(op.table, op.value);
          return sql.query(
            `INSERT INTO ${tableSql(op.table)} (
               id, data, created_at, ${PROJECTION_COLUMNS.join(", ")}
             )
             VALUES (
               $1, $2::jsonb, $3, ${PROJECTION_COLUMNS.map((_, index) => `$${index + 4}`).join(", ")}
             )
             ON CONFLICT (id) DO UPDATE SET
               data = EXCLUDED.data,
               created_at = EXCLUDED.created_at,
               ${PROJECTION_COLUMNS.map((column) => `${column} = EXCLUDED.${column}`).join(", ")}`,
            [op.id, JSON.stringify(op.value), op.createdAt, ...PROJECTION_COLUMNS.map((column) => projection[column])]
          );
        }
        return sql.query(`DELETE FROM ${tableSql(op.table)} WHERE id = $1`, [op.id]);
      })
    );
    return;
  }

  const dbh = getSqlite();
  const saveStmt = new Map<string, Database.Statement>();
  const deleteStmt = new Map<string, Database.Statement<[string]>>();
  const tx = dbh.transaction((records: PersistOp[]) => {
    for (const op of records) {
      if (op.kind === "save") {
        const projection = projectRecord(op.table, op.value);
        if (!saveStmt.has(op.table)) {
          saveStmt.set(op.table, dbh.prepare(`INSERT OR REPLACE INTO ${op.table} (id, data, created_at, ${PROJECTION_COLUMNS.join(", ")}) VALUES (?, ?, ?, ${PROJECTION_COLUMNS.map(() => "?").join(", ")})`));
        }
        saveStmt.get(op.table)!.run(op.id, JSON.stringify(op.value), op.createdAt, ...PROJECTION_COLUMNS.map((column) => projection[column]));
      } else {
        if (!deleteStmt.has(op.table)) {
          deleteStmt.set(op.table, dbh.prepare(`DELETE FROM ${op.table} WHERE id = ?`));
        }
        deleteStmt.get(op.table)!.run(op.id);
      }
    }
  });
  tx(ops);
}

export async function runAtomic<T>(work: () => T | Promise<T>) {
  if (atomicOps) throw new Error("Nested atomic workflow is not supported");
  const snapshot: Store = structuredClone(store);
  atomicOps = [];
  try {
    const result = await work();
    const ops = atomicOps;
    atomicOps = null;
    await persistAtomicOps(ops);
    return result;
  } catch (error) {
    atomicOps = null;
    store.snapshots = snapshot.snapshots;
    store.syncLogs = snapshot.syncLogs;
    store.tickets = snapshot.tickets;
    store.approvals = snapshot.approvals;
    store.compensations = snapshot.compensations;
    store.inventory = snapshot.inventory;
    store.inventoryBatches = snapshot.inventoryBatches;
    store.inventoryLocks = snapshot.inventoryLocks;
    store.scans = snapshot.scans;
    store.qcRules = snapshot.qcRules;
    store.approvalRules = snapshot.approvalRules;
    store.users = snapshot.users;
    console.error("Atomic workflow failed; state rolled back for compensation", error);
    throw error;
  }
}

export async function flushWrites() {
  if (!usePostgres) return;
  while (pendingWrites.length > 0) {
    const writes = pendingWrites.splice(0);
    await Promise.all(writes);
  }
}

const demoSnapshots: WaybillSnapshot[] = [
  {
    waybillNo: "JT202607060001",
    externalCode: "PS2512220005001",
    receiverStore: "海口龙湖天街店",
    receiverName: "林小满",
    receiverPhone: "13800138001",
    receiverAddress: "海南省海口市龙华区龙湖天街",
    amount: 1280,
    warehouseId: "WH-HN",
    merchantId: "M-ZTOCC",
    source: "mock",
    syncedAt: now(),
    skus: [
      { skuCode: "SKU-DRY-001", skuName: "常温烙锅底料", expectedQty: 20, batchNo: "BATCH-HK-001", temperatureLayer: "常温" },
      { skuCode: "SKU-COLD-008", skuName: "冷藏牛肉卷", expectedQty: 8, batchNo: "BATCH-HK-002", temperatureLayer: "冷藏" },
    ],
  },
  {
    waybillNo: "JT202607060002",
    externalCode: "PS2512220005002",
    receiverStore: "长沙五一广场店",
    receiverName: "周星",
    receiverPhone: "13800138002",
    receiverAddress: "湖南省长沙市芙蓉区五一广场",
    amount: 5600,
    warehouseId: "WH-HN",
    merchantId: "M-ZTOCC",
    source: "mock",
    syncedAt: now(),
    skus: [
      { skuCode: "SKU-FROZEN-021", skuName: "冷冻羊肉片", expectedQty: 50, batchNo: "BATCH-CS-021", temperatureLayer: "冷冻" },
      { skuCode: "SKU-DRY-003", skuName: "干碟调料", expectedQty: 60, batchNo: "BATCH-CS-003", temperatureLayer: "常温" },
    ],
  },
];

const seedTickets: ExceptionTicket[] = [
  {
    id: "T-20260706-0001",
    source: "manual",
    category: "logistics",
    type: "lost",
    status: "level1_review",
    waybillNo: "JT202607060001",
    amount: 1280,
    description: "承运商反馈中转扫描后无下文，疑似丢件。",
    reporterId: "operator-a",
    assigneeRole: "level1_approver",
    retryCount: 0,
    version: 1,
    createdAt: now(),
    updatedAt: now(),
    dueAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    snapshotSource: "mock",
    snapshotSyncedAt: now(),
  },
];

const seedQcRules: QcRule[] = [
    {
      id: "QC-QTY-10",
      name: "数量差异超过 10%",
      subtype: "quantity_mismatch",
      severity: "high",
      conditionType: "quantity_delta_percent",
      threshold: 10,
      autoCreateTicket: true,
      approvalEntry: "level2",
      enabled: true,
    },
    {
      id: "QC-DAMAGE-3",
      name: "外观破损等级 >= 3",
      subtype: "appearance_damage",
      severity: "medium",
      conditionType: "damage_level",
      threshold: 3,
      autoCreateTicket: true,
      approvalEntry: "level1",
      enabled: true,
    },
  ];

const seedApprovalRules: ApprovalRule[] = [
    {
      id: "APV-L1",
      name: "3000 元以下一级审批",
      minAmount: 0,
      targetLevel: "level1",
      timeoutHours: 8,
      maxResubmitCount: 2,
      enabled: true,
    },
    {
      id: "APV-L2",
      name: "3000 元及以上二级审批",
      minAmount: 3000,
      targetLevel: "level2",
      timeoutHours: 12,
      maxResubmitCount: 2,
      enabled: true,
    },
  ];

const seedUsers: UserAccount[] = [
  { id: "operator-a", name: "操作员 A", role: "operator", enabled: true, warehouseId: "WH-HN", merchantId: "M-ZTOCC" },
  { id: "operator-b", name: "操作员 B", role: "operator", enabled: true, warehouseId: "WH-HN", merchantId: "M-ZTOCC" },
  { id: "qc-manager-a", name: "品控主管 A", role: "qc_supervisor", enabled: true, warehouseId: "WH-HN", merchantId: "M-ZTOCC" },
  { id: "approver-a", name: "一级审批 A", role: "level1_approver", enabled: true, warehouseId: "WH-HN", merchantId: "M-ZTOCC" },
  { id: "approver-b", name: "二级审批 B", role: "level2_approver", enabled: true, warehouseId: "WH-HN", merchantId: "M-ZTOCC" },
  { id: "approver-disabled", name: "禁用审批人", role: "level1_approver", enabled: false, warehouseId: "WH-HN", merchantId: "M-ZTOCC" },
  { id: "admin-a", name: "管理员 A", role: "admin", enabled: true, warehouseId: "WH-HN", merchantId: "M-ZTOCC" },
];

const seedInventoryBatches: InventoryBatch[] = [
  { id: "IB-SKU-DRY-001-BATCH-HK-001", skuCode: "SKU-DRY-001", batchNo: "BATCH-HK-001", totalQty: 100, availableQty: 100, lockedQty: 0, status: "available", updatedAt: now() },
  { id: "IB-SKU-COLD-008-BATCH-HK-002", skuCode: "SKU-COLD-008", batchNo: "BATCH-HK-002", totalQty: 40, availableQty: 40, lockedQty: 0, status: "available", updatedAt: now() },
  { id: "IB-SKU008-perf_test_1780671746173", skuCode: "SKU008", batchNo: "perf_test_1780671746173", totalQty: 20, availableQty: 20, lockedQty: 0, status: "available", updatedAt: now() },
];

function ensureSeeded() {
  if (usePostgres) return;
  getSqlite();
  if (tableCount(TABLES.snapshots) === 0) seedRecords(TABLES.snapshots, demoSnapshots, (item) => item.waybillNo);
  if (tableCount(TABLES.tickets) === 0) seedRecords(TABLES.tickets, seedTickets, (item) => item.id);
  if (tableCount(TABLES.qcRules) === 0) seedRecords(TABLES.qcRules, seedQcRules, (item) => item.id);
  if (tableCount(TABLES.approvalRules) === 0) seedRecords(TABLES.approvalRules, seedApprovalRules, (item) => item.id);
  if (tableCount(TABLES.users) === 0) seedRecords(TABLES.users, seedUsers, (item) => item.id);
  if (tableCount(TABLES.inventoryBatches) === 0) seedRecords(TABLES.inventoryBatches, seedInventoryBatches, (item) => item.id);
}

ensureSeeded();

const store: Store = {
  snapshots: usePostgres ? [...demoSnapshots] : loadTable<WaybillSnapshot>(TABLES.snapshots),
  syncLogs: usePostgres ? [] : loadTable<SyncLog>(TABLES.syncLogs),
  tickets: usePostgres ? [...seedTickets] : loadTable<ExceptionTicket>(TABLES.tickets),
  approvals: usePostgres ? [] : loadTable<ApprovalRecord>(TABLES.approvals),
  compensations: usePostgres ? [] : loadTable<CompensationRecord>(TABLES.compensations),
  inventory: usePostgres ? [] : loadTable<InventoryRecord>(TABLES.inventory),
  inventoryBatches: usePostgres ? [...seedInventoryBatches] : loadTable<InventoryBatch>(TABLES.inventoryBatches),
  inventoryLocks: usePostgres ? [] : loadTable<InventoryLock>(TABLES.inventoryLocks),
  scans: usePostgres ? [] : loadTable<ScanRecord>(TABLES.scans),
  qcRules: usePostgres ? [...seedQcRules] : loadTable<QcRule>(TABLES.qcRules),
  approvalRules: usePostgres ? [...seedApprovalRules] : loadTable<ApprovalRule>(TABLES.approvalRules),
  users: usePostgres ? [...seedUsers] : loadTable<UserAccount>(TABLES.users),
};

async function seedPostgresIfNeeded() {
  await ensurePostgres();
  if ((await pgCount(TABLES.snapshots)) === 0) await pgSeedRecords(TABLES.snapshots, demoSnapshots, (item) => item.waybillNo);
  if ((await pgCount(TABLES.tickets)) === 0) await pgSeedRecords(TABLES.tickets, seedTickets, (item) => item.id);
  if ((await pgCount(TABLES.qcRules)) === 0) await pgSeedRecords(TABLES.qcRules, seedQcRules, (item) => item.id);
  if ((await pgCount(TABLES.approvalRules)) === 0) await pgSeedRecords(TABLES.approvalRules, seedApprovalRules, (item) => item.id);
  if ((await pgCount(TABLES.users)) === 0) await pgSeedRecords(TABLES.users, seedUsers, (item) => item.id);
  if ((await pgCount(TABLES.inventoryBatches)) === 0) await pgSeedRecords(TABLES.inventoryBatches, seedInventoryBatches, (item) => item.id);
}

async function loadPostgresStore() {
  await seedPostgresIfNeeded();
  store.snapshots = await pgLoadTable<WaybillSnapshot>(TABLES.snapshots);
  store.syncLogs = await pgLoadTable<SyncLog>(TABLES.syncLogs);
  store.tickets = await pgLoadTable<ExceptionTicket>(TABLES.tickets);
  store.approvals = await pgLoadTable<ApprovalRecord>(TABLES.approvals);
  store.compensations = await pgLoadTable<CompensationRecord>(TABLES.compensations);
  store.inventory = await pgLoadTable<InventoryRecord>(TABLES.inventory);
  store.inventoryBatches = await pgLoadTable<InventoryBatch>(TABLES.inventoryBatches);
  store.inventoryLocks = await pgLoadTable<InventoryLock>(TABLES.inventoryLocks);
  store.scans = await pgLoadTable<ScanRecord>(TABLES.scans);
  store.qcRules = await pgLoadTable<QcRule>(TABLES.qcRules);
  store.approvalRules = await pgLoadTable<ApprovalRule>(TABLES.approvalRules);
  store.users = await pgLoadTable<UserAccount>(TABLES.users);
  hydrated = true;
}

export async function hydrateStore() {
  if (!usePostgres || hydrated) return;
  hydratePromise ??= loadPostgresStore().finally(() => {
    hydratePromise = null;
  });
  await hydratePromise;
}

export async function refreshStore() {
  if (!usePostgres) return;
  await loadPostgresStore();
}

export function db() {
  return store;
}

export function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function roleFromHeader(role: string | null): UserRole {
  if (
    role === "operator" ||
    role === "qc_supervisor" ||
    role === "level1_approver" ||
    role === "level2_approver" ||
    role === "admin"
  ) {
    return role;
  }
  return "operator";
}

export function currentUser(headers: Headers) {
  const id = headers.get("x-user-id") || "operator-a";
  const user = store.users.find((item) => item.id === id);
  if (user) {
    return {
      id: user.id,
      role: user.role,
      warehouseId: user.warehouseId,
      merchantId: user.merchantId,
      enabled: user.enabled,
    };
  }
  return {
    id,
    role: roleFromHeader(headers.get("x-user-role")),
    warehouseId: headers.get("x-warehouse-id") || "WH-HN",
    merchantId: headers.get("x-merchant-id") || "M-ZTOCC",
    enabled: true,
  };
}

export function getOpenTicketForBatch(waybillNo: string, skuCode: string, batchNo: string) {
  return store.tickets.find(
    (ticket) =>
      ticket.category === "quality" &&
      ticket.waybillNo === waybillNo &&
      ticket.skuCode === skuCode &&
      ticket.batchNo === batchNo &&
      !["completed", "closed"].includes(ticket.status)
  );
}

export function getOpenQualityTicketForBatch(skuCode: string, batchNo: string) {
  return store.tickets.find(
    (ticket) =>
      ticket.category === "quality" &&
      ticket.skuCode === skuCode &&
      ticket.batchNo === batchNo &&
      !["completed", "closed"].includes(ticket.status)
  );
}

export function getSnapshot(waybillNo: string) {
  return store.snapshots.find((item) => item.waybillNo === waybillNo);
}

export function saveSnapshot(snapshot: WaybillSnapshot) {
  const idx = store.snapshots.findIndex((item) => item.waybillNo === snapshot.waybillNo);
  if (idx >= 0) store.snapshots[idx] = snapshot;
  else store.snapshots.unshift(snapshot);
  saveRecord(TABLES.snapshots, snapshot.waybillNo, snapshot);
  return snapshot;
}

export function addSyncLog(log: Omit<SyncLog, "id" | "createdAt">) {
  const entry = { id: makeId("LOG"), createdAt: now(), ...log };
  store.syncLogs.unshift(entry);
  saveRecord(TABLES.syncLogs, entry.id, entry);
  const removed = store.syncLogs.splice(200);
  for (const item of removed) deleteRecord(TABLES.syncLogs, item.id);
  return entry;
}

export function addTicket(ticket: ExceptionTicket) {
  store.tickets.unshift(ticket);
  saveRecord(TABLES.tickets, ticket.id, ticket);
}

export function saveTicket(ticket: ExceptionTicket) {
  saveRecord(TABLES.tickets, ticket.id, ticket);
}

export function addApproval(record: ApprovalRecord) {
  store.approvals.unshift(record);
  saveRecord(TABLES.approvals, record.id, record);
}

export function addCompensation(record: CompensationRecord) {
  store.compensations.unshift(record);
  saveRecord(TABLES.compensations, record.id, record);
}

export function addInventoryRecord(record: InventoryRecord) {
  store.inventory.unshift(record);
  saveRecord(TABLES.inventory, record.id, record);
}

export function saveInventoryBatch(batch: InventoryBatch) {
  const idx = store.inventoryBatches.findIndex((item) => item.id === batch.id);
  if (idx >= 0) store.inventoryBatches[idx] = batch;
  else store.inventoryBatches.unshift(batch);
  saveRecord(TABLES.inventoryBatches, batch.id, batch);
}

export function saveInventoryLock(lock: InventoryLock) {
  const idx = store.inventoryLocks.findIndex((item) => item.id === lock.id);
  if (idx >= 0) store.inventoryLocks[idx] = lock;
  else store.inventoryLocks.unshift(lock);
  saveRecord(TABLES.inventoryLocks, lock.id, lock);
}

export function ensureInventoryBatch(skuCode: string, batchNo: string) {
  const id = `IB-${skuCode}-${batchNo}`;
  let batch = store.inventoryBatches.find((item) => item.skuCode === skuCode && item.batchNo === batchNo);
  if (!batch) {
    batch = { id, skuCode, batchNo, totalQty: 0, availableQty: 0, lockedQty: 0, status: "available", updatedAt: now() };
    saveInventoryBatch(batch);
  }
  return batch;
}

export function lockInventory(params: { ticketId: string; skuCode: string; batchNo: string; qty: number; reason: string }) {
  const existing = store.inventoryLocks.find((item) => item.ticketId === params.ticketId && item.skuCode === params.skuCode && item.batchNo === params.batchNo && item.status === "locked");
  if (existing) return existing;

  const batch = ensureInventoryBatch(params.skuCode, params.batchNo);
  const qty = Math.max(1, params.qty);
  batch.availableQty = Math.max(0, batch.availableQty - qty);
  batch.lockedQty += qty;
  batch.status = batch.lockedQty > 0 ? "locked" : "available";
  batch.updatedAt = now();
  saveInventoryBatch(batch);

  const lock: InventoryLock = {
    id: makeId("LOCK"),
    ticketId: params.ticketId,
    skuCode: params.skuCode,
    batchNo: params.batchNo,
    qty,
    status: "locked",
    reason: params.reason,
    createdAt: now(),
    updatedAt: now(),
  };
  saveInventoryLock(lock);
  return lock;
}

export function releaseInventoryLock(ticketId: string, mode: "release" | "consume" = "release") {
  const locks = store.inventoryLocks.filter((item) => item.ticketId === ticketId && item.status === "locked");
  for (const lock of locks) {
    const batch = ensureInventoryBatch(lock.skuCode, lock.batchNo);
    batch.lockedQty = Math.max(0, batch.lockedQty - lock.qty);
    if (mode === "release") batch.availableQty += lock.qty;
    batch.status = batch.lockedQty > 0 ? "locked" : "available";
    batch.updatedAt = now();
    saveInventoryBatch(batch);

    lock.status = mode === "release" ? "released" : "consumed";
    lock.updatedAt = now();
    saveInventoryLock(lock);
  }
  return locks;
}

export function addScan(scan: ScanRecord) {
  store.scans.unshift(scan);
  saveRecord(TABLES.scans, scan.id, scan);
}

export function saveQcRule(rule: QcRule) {
  const idx = store.qcRules.findIndex((item) => item.id === rule.id);
  if (idx >= 0) store.qcRules[idx] = rule;
  else store.qcRules.unshift(rule);
  saveRecord(TABLES.qcRules, rule.id, rule);
}

export function saveApprovalRule(rule: ApprovalRule) {
  const idx = store.approvalRules.findIndex((item) => item.id === rule.id);
  if (idx >= 0) store.approvalRules[idx] = rule;
  else store.approvalRules.unshift(rule);
  saveRecord(TABLES.approvalRules, rule.id, rule);
}

export function saveUser(user: UserAccount) {
  const idx = store.users.findIndex((item) => item.id === user.id);
  if (idx >= 0) store.users[idx] = user;
  else store.users.unshift(user);
  saveRecord(TABLES.users, user.id, user);
}

export function findEnabledUserByRole(role: UserRole, excludeUserId?: string) {
  return store.users.find((user) => user.role === role && user.enabled && user.id !== excludeUserId);
}

export function seedManyTickets(count = 220) {
  const statuses: ExceptionTicket["status"][] = ["pending", "level1_review", "level2_review", "executing", "completed", "rejected"];
  const types: ExceptionTicket["type"][] = ["lost", "damaged", "rejected", "timeout", "address_error"];
  for (let i = 0; i < count; i++) {
    const snapshot = store.snapshots[i % store.snapshots.length];
    const ticket: ExceptionTicket = {
      id: `T-SEED-${String(i + 1).padStart(4, "0")}`,
      source: "manual",
      category: "logistics",
      type: types[i % types.length],
      status: statuses[i % statuses.length],
      waybillNo: snapshot.waybillNo,
      amount: snapshot.amount + (i % 7) * 120,
      description: `模拟异常工单 ${i + 1}`,
      reporterId: i % 4 === 0 ? "operator-b" : "operator-a",
      assigneeRole: i % 3 === 0 ? "level2_approver" : "level1_approver",
      retryCount: i % 2,
      version: 1,
      createdAt: now(),
      updatedAt: now(),
      dueAt: new Date(Date.now() + ((i % 10) - 2) * 60 * 60 * 1000).toISOString(),
      snapshotSource: snapshot.source,
      snapshotSyncedAt: snapshot.syncedAt,
    };
    if (!store.tickets.some((item) => item.id === ticket.id)) {
      store.tickets.push(ticket);
      saveRecord(TABLES.tickets, ticket.id, ticket);
    }
  }
}
