import { pool } from "../db/mysql";
import { AppError } from "../utils/errors";
import {
  buildLimitClause,
  buildPaginatedResult,
  parsePaginationParams,
} from "../utils/pagination";

type Query = Record<string, unknown>;
type SqlParam = string | number | null;
type SqlParams = SqlParam[];

interface CountRow {
  total: number;
}

export interface LoginLogItem {
  id: number;
  userId: number | null;
  loginName: string;
  loginIp: string | null;
  userAgent: string | null;
  loginResult: number;
  failureReason: string | null;
  loggedAt: string;
}

export interface OperationLogItem {
  id: number;
  operatorId: number | null;
  operatorName: string | null;
  moduleCode: string;
  operationType: string;
  requestMethod: string;
  requestPath: string;
  requestParams: string | null;
  operationResult: number;
  errorMessage: string | null;
  operatedAt: string;
}

export interface ExceptionLogInput {
  requestPath: string;
  requestMethod: string;
  errorType: string;
  errorMessage: string;
  stackSummary?: string | null;
}

export interface ExceptionLogItem {
  id: number;
  requestPath: string;
  requestMethod: string;
  errorType: string;
  errorMessage: string;
  stackSummary: string | null;
  handledStatus: number;
  occurredAt: string;
}

function stringValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
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

function applyTimeRange(
  conditions: string[],
  params: SqlParams,
  query: Query,
  column: string
) {
  const startAt = stringValue(query.startAt);
  if (startAt) {
    conditions.push(`${column} >= ?`);
    params.push(startAt);
  }

  const endAt = stringValue(query.endAt);
  if (endAt) {
    conditions.push(`${column} <= ?`);
    params.push(endAt);
  }
}

export async function recordExceptionLog(input: ExceptionLogInput): Promise<void> {
  await pool.execute(
    `INSERT INTO exception_logs
       (request_path, request_method, error_type, error_message, stack_summary,
        handled_status, occurred_at)
     VALUES (?, ?, ?, ?, ?, 0, NOW())`,
    [
      input.requestPath,
      input.requestMethod,
      input.errorType,
      input.errorMessage.slice(0, 3000),
      input.stackSummary?.slice(0, 3000) ?? null,
    ]
  );
}

export async function listLoginLogs(query: Query) {
  const { page, pageSize } = parsePaginationParams(query);
  const { limit, offset } = buildLimitClause(page, pageSize);
  const conditions = ["1 = 1"];
  const params: SqlParams = [];

  const loginName = stringValue(query.loginName);
  if (loginName) {
    conditions.push("login_name LIKE ?");
    params.push(`%${loginName}%`);
  }

  if (query.loginResult !== undefined && query.loginResult !== "") {
    conditions.push("login_result = ?");
    params.push(Number(query.loginResult));
  }
  applyTimeRange(conditions, params, query, "logged_at");

  const where = conditions.join(" AND ");
  const rows = await list<LoginLogItem>(
    `SELECT id, user_id AS userId, login_name AS loginName,
            login_ip AS loginIp, user_agent AS userAgent,
            login_result AS loginResult, failure_reason AS failureReason,
            logged_at AS loggedAt
     FROM login_logs
     WHERE ${where}
     ORDER BY logged_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const totalItems = await count(
    `SELECT COUNT(*) AS total FROM login_logs WHERE ${where}`,
    params
  );
  return buildPaginatedResult(rows, totalItems, page, pageSize);
}

export async function getLoginLog(id: number): Promise<LoginLogItem> {
  const row = await first<LoginLogItem>(
    `SELECT id, user_id AS userId, login_name AS loginName,
            login_ip AS loginIp, user_agent AS userAgent,
            login_result AS loginResult, failure_reason AS failureReason,
            logged_at AS loggedAt
     FROM login_logs
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  if (!row) throw new AppError("NOT_FOUND", "登录日志不存在");
  return row;
}

export async function listOperationLogs(query: Query) {
  const { page, pageSize } = parsePaginationParams(query);
  const { limit, offset } = buildLimitClause(page, pageSize);
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
  applyTimeRange(conditions, params, query, "operated_at");

  const where = conditions.join(" AND ");
  const rows = await list<OperationLogItem>(
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

export async function getOperationLog(id: number): Promise<OperationLogItem> {
  const row = await first<OperationLogItem>(
    `SELECT id, operator_id AS operatorId, operator_name AS operatorName,
            module_code AS moduleCode, operation_type AS operationType,
            request_method AS requestMethod, request_path AS requestPath,
            request_params AS requestParams, operation_result AS operationResult,
            error_message AS errorMessage, operated_at AS operatedAt
     FROM operation_logs
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  if (!row) throw new AppError("NOT_FOUND", "操作日志不存在");
  return row;
}

export async function listExceptionLogs(query: Query) {
  const { page, pageSize } = parsePaginationParams(query);
  const { limit, offset } = buildLimitClause(page, pageSize);
  const conditions = ["1 = 1"];
  const params: SqlParams = [];

  const requestPath = stringValue(query.requestPath);
  if (requestPath) {
    conditions.push("request_path LIKE ?");
    params.push(`%${requestPath}%`);
  }

  const errorType = stringValue(query.errorType);
  if (errorType) {
    conditions.push("error_type LIKE ?");
    params.push(`%${errorType}%`);
  }

  if (query.handledStatus !== undefined && query.handledStatus !== "") {
    conditions.push("handled_status = ?");
    params.push(Number(query.handledStatus));
  }
  applyTimeRange(conditions, params, query, "occurred_at");

  const where = conditions.join(" AND ");
  const rows = await list<ExceptionLogItem>(
    `SELECT id, request_path AS requestPath, request_method AS requestMethod,
            error_type AS errorType, error_message AS errorMessage,
            stack_summary AS stackSummary, handled_status AS handledStatus,
            occurred_at AS occurredAt
     FROM exception_logs
     WHERE ${where}
     ORDER BY occurred_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const totalItems = await count(
    `SELECT COUNT(*) AS total FROM exception_logs WHERE ${where}`,
    params
  );
  return buildPaginatedResult(rows, totalItems, page, pageSize);
}

export async function getExceptionLog(id: number): Promise<ExceptionLogItem> {
  const row = await first<ExceptionLogItem>(
    `SELECT id, request_path AS requestPath, request_method AS requestMethod,
            error_type AS errorType, error_message AS errorMessage,
            stack_summary AS stackSummary, handled_status AS handledStatus,
            occurred_at AS occurredAt
     FROM exception_logs
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  if (!row) throw new AppError("NOT_FOUND", "异常日志不存在");
  return row;
}
