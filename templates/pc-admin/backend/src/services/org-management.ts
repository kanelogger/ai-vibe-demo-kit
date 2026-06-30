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
type EntityKind = "department" | "post";

interface CountRow {
  total: number;
}

const CONFIG = {
  department: {
    table: "departments",
    codeColumn: "dept_code",
    nameColumn: "dept_name",
    codeKey: "deptCode",
    nameKey: "deptName",
    label: "部门",
    conflict: "部门编码已存在",
    inUseCode: "DEPARTMENT_IN_USE" as const,
    inUseMessage: "部门已被用户引用，不能删除",
    userColumn: "dept_id",
  },
  post: {
    table: "posts",
    codeColumn: "post_code",
    nameColumn: "post_name",
    codeKey: "postCode",
    nameKey: "postName",
    label: "岗位",
    conflict: "岗位编码已存在",
    inUseCode: "POST_IN_USE" as const,
    inUseMessage: "岗位已被用户引用，不能删除",
    userColumn: "post_id",
  },
};

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

function duplicateToConflict(error: unknown, message: string): never {
  if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
    throw new AppError("CONFLICT", message);
  }
  throw error;
}

function filterFor(kind: EntityKind, query: Query): { where: string; params: SqlParams } {
  const config = CONFIG[kind];
  const conditions = ["deleted = 0"];
  const params: SqlParams = [];

  const code = stringValue(query[config.codeKey]);
  if (code) {
    conditions.push(`${config.codeColumn} LIKE ?`);
    params.push(`%${code}%`);
  }

  const name = stringValue(query[config.nameKey]);
  if (name) {
    conditions.push(`${config.nameColumn} LIKE ?`);
    params.push(`%${name}%`);
  }

  if (query.status !== undefined && query.status !== "") {
    conditions.push("status = ?");
    params.push(Number(query.status));
  }

  return { where: conditions.join(" AND "), params };
}

export async function listOrgEntities(kind: EntityKind, query: Query) {
  const config = CONFIG[kind];
  const { page, pageSize } = parsePaginationParams(query);
  const { limit, offset } = buildLimitClause(page, pageSize);
  const { where, params } = filterFor(kind, query);
  const rows = await list(
    `SELECT id, ${config.codeColumn} AS ${config.codeKey},
            ${config.nameColumn} AS ${config.nameKey}, status, description,
            created_at AS createdAt, updated_at AS updatedAt
     FROM ${config.table}
     WHERE ${where}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const totalItems = await count(
    `SELECT COUNT(*) AS total FROM ${config.table} WHERE ${where}`,
    params
  );
  return buildPaginatedResult(rows, totalItems, page, pageSize);
}

export async function getOrgEntity(kind: EntityKind, id: number) {
  const config = CONFIG[kind];
  const row = await first(
    `SELECT id, ${config.codeColumn} AS ${config.codeKey},
            ${config.nameColumn} AS ${config.nameKey}, status, description,
            created_at AS createdAt, updated_at AS updatedAt
     FROM ${config.table}
     WHERE id = ? AND deleted = 0
     LIMIT 1`,
    [id]
  );
  if (!row) throw new AppError("NOT_FOUND", `${config.label}不存在`);
  return row;
}

export async function createOrgEntity(
  kind: EntityKind,
  input: unknown,
  actorId: number | null
) {
  const config = CONFIG[kind];
  const body = bodyOf(input);
  try {
    const result = await execute(
      `INSERT INTO ${config.table}
         (${config.codeColumn}, ${config.nameColumn}, status, description, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        requiredString(body, config.codeKey, `${config.label}编码`),
        requiredString(body, config.nameKey, `${config.label}名称`),
        statusValue(body.status),
        stringValue(body.description),
        actorId,
        actorId,
      ]
    );
    return getOrgEntity(kind, result.insertId);
  } catch (error) {
    duplicateToConflict(error, config.conflict);
  }
}

export async function updateOrgEntity(
  kind: EntityKind,
  id: number,
  input: unknown,
  actorId: number | null
) {
  const config = CONFIG[kind];
  const body = bodyOf(input);
  try {
    assertAffected(
      await execute(
        `UPDATE ${config.table}
         SET ${config.codeColumn} = ?, ${config.nameColumn} = ?, status = ?,
             description = ?, updated_by = ?
         WHERE id = ? AND deleted = 0`,
        [
          requiredString(body, config.codeKey, `${config.label}编码`),
          requiredString(body, config.nameKey, `${config.label}名称`),
          statusValue(body.status),
          stringValue(body.description),
          actorId,
          id,
        ]
      ),
      `${config.label}不存在`
    );
    return getOrgEntity(kind, id);
  } catch (error) {
    duplicateToConflict(error, config.conflict);
  }
}

export async function updateOrgEntityStatus(
  kind: EntityKind,
  id: number,
  status: unknown,
  actorId: number | null
) {
  const config = CONFIG[kind];
  assertAffected(
    await execute(
      `UPDATE ${config.table} SET status = ?, updated_by = ?
       WHERE id = ? AND deleted = 0`,
      [statusValue(status), actorId, id]
    ),
    `${config.label}不存在`
  );
  return getOrgEntity(kind, id);
}

export async function deleteOrgEntity(
  kind: EntityKind,
  id: number,
  actorId: number | null
): Promise<void> {
  const config = CONFIG[kind];
  const used = await count(
    `SELECT COUNT(*) AS total FROM users WHERE ${config.userColumn} = ? AND deleted = 0`,
    [id]
  );
  if (used > 0) {
    throw new AppError(config.inUseCode, config.inUseMessage);
  }

  assertAffected(
    await execute(
      `UPDATE ${config.table} SET deleted = 1, updated_by = ?
       WHERE id = ? AND deleted = 0`,
      [actorId, id]
    ),
    `${config.label}不存在`
  );
}
