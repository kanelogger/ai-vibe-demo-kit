import type { ResultSetHeader } from "mysql2/promise";
import { pool } from "../db/mysql";
import { AppError } from "../utils/errors";
import {
  buildLimitClause,
  buildPaginatedResult,
  parsePaginationParams,
} from "../utils/pagination";

type Query = Record<string, unknown>;
type Body = Record<string, unknown>;
type SqlParam = string | number | null;
type SqlParams = SqlParam[];

interface CountRow {
  total: number;
}

export interface SystemConfigItem {
  id: number;
  configCode: string;
  configName: string;
  configValue: string;
  valueType: string;
  status: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SystemConfigValue {
  configCode: string;
  configValue: string;
  valueType: string;
}

const VALUE_TYPES = new Set(["STRING", "NUMBER", "BOOLEAN", "JSON"]);

function stringValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function requiredString(body: Body, key: string, label: string): string {
  const value = stringValue(body[key]);
  if (!value) throw new AppError("VALIDATION_ERROR", `${label}不能为空`);
  return value;
}

function statusValue(value: unknown): number {
  const status = Number(value);
  return status === 0 ? 0 : 1;
}

function valueTypeOf(value: unknown): string {
  const valueType = String(value ?? "STRING").trim().toUpperCase();
  return VALUE_TYPES.has(valueType) ? valueType : "STRING";
}

function bodyOf(input: unknown): Body {
  return input && typeof input === "object" ? (input as Body) : {};
}

async function execute(
  sql: string,
  params: SqlParams = []
): Promise<ResultSetHeader> {
  const [result] = await pool.execute(sql, params);
  return result as ResultSetHeader;
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

function assertAffected(result: ResultSetHeader, message: string): void {
  if (result.affectedRows === 0) throw new AppError("NOT_FOUND", message);
}

function duplicateToConflict(error: unknown): never {
  if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
    throw new AppError("CONFLICT", "配置编码已存在");
  }
  throw error;
}

function buildConfigFilter(query: Query): { where: string; params: SqlParams } {
  const conditions = ["deleted = 0"];
  const params: SqlParams = [];

  const configCode = stringValue(query.configCode);
  if (configCode) {
    conditions.push("config_code LIKE ?");
    params.push(`%${configCode}%`);
  }

  const configName = stringValue(query.configName);
  if (configName) {
    conditions.push("config_name LIKE ?");
    params.push(`%${configName}%`);
  }

  if (query.status !== undefined && query.status !== "") {
    conditions.push("status = ?");
    params.push(Number(query.status));
  }

  return { where: conditions.join(" AND "), params };
}

export async function listSystemConfigs(query: Query) {
  const { page, pageSize } = parsePaginationParams(query);
  const { limit, offset } = buildLimitClause(page, pageSize);
  const { where, params } = buildConfigFilter(query);

  const rows = await list<SystemConfigItem>(
    `SELECT id, config_code AS configCode, config_name AS configName,
            config_value AS configValue, value_type AS valueType, status,
            description, created_at AS createdAt, updated_at AS updatedAt
     FROM system_configs
     WHERE ${where}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const totalItems = await count(
    `SELECT COUNT(*) AS total FROM system_configs WHERE ${where}`,
    params
  );

  return buildPaginatedResult(rows, totalItems, page, pageSize);
}

export async function getSystemConfig(id: number): Promise<SystemConfigItem> {
  const row = await first<SystemConfigItem>(
    `SELECT id, config_code AS configCode, config_name AS configName,
            config_value AS configValue, value_type AS valueType, status,
            description, created_at AS createdAt, updated_at AS updatedAt
     FROM system_configs
     WHERE id = ? AND deleted = 0
     LIMIT 1`,
    [id]
  );
  if (!row) throw new AppError("NOT_FOUND", "配置不存在");
  return row;
}

export async function createSystemConfig(
  input: unknown,
  actorId: number | null
): Promise<SystemConfigItem> {
  const body = bodyOf(input);
  try {
    const result = await execute(
      `INSERT INTO system_configs
         (config_code, config_name, config_value, value_type, status,
          description, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        requiredString(body, "configCode", "配置编码"),
        requiredString(body, "configName", "配置名称"),
        requiredString(body, "configValue", "配置值"),
        valueTypeOf(body.valueType),
        statusValue(body.status),
        stringValue(body.description),
        actorId,
        actorId,
      ]
    );
    return getSystemConfig(result.insertId);
  } catch (error) {
    duplicateToConflict(error);
  }
}

export async function updateSystemConfig(
  id: number,
  input: unknown,
  actorId: number | null
): Promise<SystemConfigItem> {
  const body = bodyOf(input);
  try {
    assertAffected(
      await execute(
        `UPDATE system_configs
         SET config_code = ?, config_name = ?, config_value = ?, value_type = ?,
             status = ?, description = ?, updated_by = ?
         WHERE id = ? AND deleted = 0`,
        [
          requiredString(body, "configCode", "配置编码"),
          requiredString(body, "configName", "配置名称"),
          requiredString(body, "configValue", "配置值"),
          valueTypeOf(body.valueType),
          statusValue(body.status),
          stringValue(body.description),
          actorId,
          id,
        ]
      ),
      "配置不存在"
    );
    return getSystemConfig(id);
  } catch (error) {
    duplicateToConflict(error);
  }
}

export async function updateSystemConfigStatus(
  id: number,
  status: unknown,
  actorId: number | null
): Promise<SystemConfigItem> {
  assertAffected(
    await execute(
      `UPDATE system_configs SET status = ?, updated_by = ?
       WHERE id = ? AND deleted = 0`,
      [statusValue(status), actorId, id]
    ),
    "配置不存在"
  );
  return getSystemConfig(id);
}

export async function deleteSystemConfig(
  id: number,
  actorId: number | null
): Promise<void> {
  assertAffected(
    await execute(
      `UPDATE system_configs SET deleted = 1, updated_by = ?
       WHERE id = ? AND deleted = 0`,
      [actorId, id]
    ),
    "配置不存在"
  );
}

export async function getSystemConfigValue(
  configCode: string
): Promise<SystemConfigValue> {
  const row = await first<SystemConfigValue>(
    `SELECT config_code AS configCode, config_value AS configValue,
            value_type AS valueType
     FROM system_configs
     WHERE config_code = ? AND status = 1 AND deleted = 0
     LIMIT 1`,
    [configCode]
  );
  if (!row) throw new AppError("NOT_FOUND", "配置不存在或已停用");
  return row;
}
