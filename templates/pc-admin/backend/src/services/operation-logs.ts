import { pool } from "../db/mysql";
import {
  buildLimitClause,
  buildPaginatedResult,
  parsePaginationParams,
} from "../utils/pagination";
import { getUserProfile } from "./users";

type Query = Record<string, unknown>;
type SqlParam = string | number | null;
type SqlParams = SqlParam[];

interface CountRow {
  total: number;
}

export interface OperationLogInput {
  operatorId: number | null;
  moduleCode: string;
  operationType: string;
  requestMethod: string;
  requestPath: string;
  requestParams?: unknown;
  operationResult?: 0 | 1;
  errorMessage?: string | null;
}

const SENSITIVE_KEYS = new Set([
  "password",
  "newPassword",
  "oldPassword",
  "confirmPassword",
  "accessToken",
  "refreshToken",
  "token",
  "authorization",
]);

function stringValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function redact(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(redact);
  if (!input || typeof input !== "object") return input;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEYS.has(key) ? "***" : redact(value);
  }
  return result;
}

async function list<T>(sql: string, params: SqlParams = []): Promise<T[]> {
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}

async function first<T>(sql: string, params: SqlParams = []): Promise<T | null> {
  const rows = await list<T>(sql, params);
  return rows[0] ?? null;
}

async function count(sql: string, params: SqlParams = []): Promise<number> {
  const row = await first<CountRow>(sql, params);
  return Number(row?.total ?? 0);
}

export async function recordOperationLog(input: OperationLogInput): Promise<void> {
  const profile = input.operatorId ? await getUserProfile(input.operatorId) : null;
  const requestParams = input.requestParams
    ? JSON.stringify(redact(input.requestParams)).slice(0, 3000)
    : null;

  await pool.execute(
    `INSERT INTO operation_logs
       (operator_id, operator_name, module_code, operation_type,
        request_method, request_path, request_params, operation_result,
        error_message, operated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      input.operatorId,
      profile?.nickname ?? profile?.username ?? null,
      input.moduleCode,
      input.operationType,
      input.requestMethod,
      input.requestPath,
      requestParams,
      input.operationResult ?? 1,
      input.errorMessage ?? null,
    ]
  );
}

function buildOperationLogFilter(query: Query): { where: string; params: SqlParams } {
  const conditions = ["1 = 1"];
  const params: SqlParams = [];

  const operatorName = stringValue(query.operatorName);
  if (operatorName) {
    conditions.push("operator_name LIKE ?");
    params.push(`%${operatorName}%`);
  }

  const moduleCode = stringValue(query.moduleCode);
  if (moduleCode) {
    conditions.push("module_code = ?");
    params.push(moduleCode);
  }

  const operationType = stringValue(query.operationType);
  if (operationType) {
    conditions.push("operation_type = ?");
    params.push(operationType);
  }

  if (query.operationResult !== undefined && query.operationResult !== "") {
    conditions.push("operation_result = ?");
    params.push(Number(query.operationResult));
  }

  return { where: conditions.join(" AND "), params };
}

export async function listOperationLogs(query: Query) {
  const { page, pageSize } = parsePaginationParams(query);
  const { limit, offset } = buildLimitClause(page, pageSize);
  const { where, params } = buildOperationLogFilter(query);

  const rows = await list(
    `SELECT id, operator_id AS operatorId, operator_name AS operatorName,
            module_code AS moduleCode, operation_type AS operationType,
            request_method AS requestMethod, request_path AS requestPath,
            request_params AS requestParams, operation_result AS operationResult,
            error_message AS errorMessage, operated_at AS operatedAt
     FROM operation_logs
     WHERE ${where}
     ORDER BY operated_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const totalItems = await count(
    `SELECT COUNT(*) AS total FROM operation_logs WHERE ${where}`,
    params
  );

  return buildPaginatedResult(rows, totalItems, page, pageSize);
}
