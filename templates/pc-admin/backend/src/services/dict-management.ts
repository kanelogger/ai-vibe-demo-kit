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

export interface DictTypeItem {
  id: number;
  dictCode: string;
  dictName: string;
  status: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DictItem {
  id: number;
  dictTypeId: number;
  itemValue: string;
  itemLabel: string;
  sortOrder: number;
  status: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DictOption {
  id: number;
  label: string;
  value: string;
  status: number;
}

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

function buildDictTypeFilter(query: Query): { where: string; params: SqlParams } {
  const conditions = ["deleted = 0"];
  const params: SqlParams = [];

  const dictCode = stringValue(query.dictCode);
  if (dictCode) {
    conditions.push("dict_code LIKE ?");
    params.push(`%${dictCode}%`);
  }

  const dictName = stringValue(query.dictName);
  if (dictName) {
    conditions.push("dict_name LIKE ?");
    params.push(`%${dictName}%`);
  }

  if (query.status !== undefined && query.status !== "") {
    conditions.push("status = ?");
    params.push(Number(query.status));
  }

  return { where: conditions.join(" AND "), params };
}

export async function listDictTypes(query: Query) {
  const { page, pageSize } = parsePaginationParams(query);
  const { limit, offset } = buildLimitClause(page, pageSize);
  const { where, params } = buildDictTypeFilter(query);

  const rows = await list<DictTypeItem>(
    `SELECT id, dict_code AS dictCode, dict_name AS dictName, status,
            description, created_at AS createdAt, updated_at AS updatedAt
     FROM dict_types
     WHERE ${where}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const totalItems = await count(
    `SELECT COUNT(*) AS total FROM dict_types WHERE ${where}`,
    params
  );

  return buildPaginatedResult(rows, totalItems, page, pageSize);
}

export async function getDictType(id: number): Promise<DictTypeItem> {
  const row = await first<DictTypeItem>(
    `SELECT id, dict_code AS dictCode, dict_name AS dictName, status,
            description, created_at AS createdAt, updated_at AS updatedAt
     FROM dict_types
     WHERE id = ? AND deleted = 0
     LIMIT 1`,
    [id]
  );
  if (!row) throw new AppError("NOT_FOUND", "字典类型不存在");
  return row;
}

export async function createDictType(
  input: unknown,
  actorId: number | null
): Promise<DictTypeItem> {
  const body = bodyOf(input);
  try {
    const result = await execute(
      `INSERT INTO dict_types
         (dict_code, dict_name, status, description, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        requiredString(body, "dictCode", "字典编码"),
        requiredString(body, "dictName", "字典名称"),
        statusValue(body.status),
        stringValue(body.description),
        actorId,
        actorId,
      ]
    );
    return getDictType(result.insertId);
  } catch (error) {
    duplicateToConflict(error, "字典编码已存在");
  }
}

export async function updateDictType(
  id: number,
  input: unknown,
  actorId: number | null
): Promise<DictTypeItem> {
  const body = bodyOf(input);
  try {
    assertAffected(
      await execute(
        `UPDATE dict_types
         SET dict_code = ?, dict_name = ?, status = ?, description = ?, updated_by = ?
         WHERE id = ? AND deleted = 0`,
        [
          requiredString(body, "dictCode", "字典编码"),
          requiredString(body, "dictName", "字典名称"),
          statusValue(body.status),
          stringValue(body.description),
          actorId,
          id,
        ]
      ),
      "字典类型不存在"
    );
    return getDictType(id);
  } catch (error) {
    duplicateToConflict(error, "字典编码已存在");
  }
}

export async function updateDictTypeStatus(
  id: number,
  status: unknown,
  actorId: number | null
): Promise<DictTypeItem> {
  assertAffected(
    await execute(
      `UPDATE dict_types SET status = ?, updated_by = ?
       WHERE id = ? AND deleted = 0`,
      [statusValue(status), actorId, id]
    ),
    "字典类型不存在"
  );
  return getDictType(id);
}

export async function deleteDictType(
  id: number,
  actorId: number | null
): Promise<void> {
  const activeItems = await count(
    `SELECT COUNT(*) AS total FROM dict_items
     WHERE dict_type_id = ? AND status = 1 AND deleted = 0`,
    [id]
  );
  if (activeItems > 0) {
    throw new AppError("CONFLICT", "字典类型下存在启用字典项，不能删除");
  }

  assertAffected(
    await execute(
      `UPDATE dict_types SET deleted = 1, updated_by = ?
       WHERE id = ? AND deleted = 0`,
      [actorId, id]
    ),
    "字典类型不存在"
  );
}

export async function listDictItems(dictTypeId: number): Promise<DictItem[]> {
  await getDictType(dictTypeId);
  return list<DictItem>(
    `SELECT id, dict_type_id AS dictTypeId, item_value AS itemValue,
            item_label AS itemLabel, sort_order AS sortOrder, status,
            description, created_at AS createdAt, updated_at AS updatedAt
     FROM dict_items
     WHERE dict_type_id = ? AND deleted = 0
     ORDER BY sort_order ASC, id ASC`,
    [dictTypeId]
  );
}

export async function getDictItem(id: number): Promise<DictItem> {
  const row = await first<DictItem>(
    `SELECT id, dict_type_id AS dictTypeId, item_value AS itemValue,
            item_label AS itemLabel, sort_order AS sortOrder, status,
            description, created_at AS createdAt, updated_at AS updatedAt
     FROM dict_items
     WHERE id = ? AND deleted = 0
     LIMIT 1`,
    [id]
  );
  if (!row) throw new AppError("NOT_FOUND", "字典项不存在");
  return row;
}

export async function createDictItem(
  dictTypeId: number,
  input: unknown,
  actorId: number | null
): Promise<DictItem> {
  const body = bodyOf(input);
  await getDictType(dictTypeId);
  try {
    const result = await execute(
      `INSERT INTO dict_items
         (dict_type_id, item_value, item_label, sort_order, status,
          description, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dictTypeId,
        requiredString(body, "itemValue", "字典值"),
        requiredString(body, "itemLabel", "字典标签"),
        Number(body.sortOrder ?? 0),
        statusValue(body.status),
        stringValue(body.description),
        actorId,
        actorId,
      ]
    );
    return getDictItem(result.insertId);
  } catch (error) {
    duplicateToConflict(error, "同一字典类型下字典值已存在");
  }
}

export async function updateDictItem(
  id: number,
  input: unknown,
  actorId: number | null
): Promise<DictItem> {
  const body = bodyOf(input);
  const current = await getDictItem(id);
  try {
    assertAffected(
      await execute(
        `UPDATE dict_items
         SET item_value = ?, item_label = ?, sort_order = ?, status = ?,
             description = ?, updated_by = ?
         WHERE id = ? AND deleted = 0`,
        [
          requiredString(body, "itemValue", "字典值"),
          requiredString(body, "itemLabel", "字典标签"),
          Number(body.sortOrder ?? current.sortOrder),
          statusValue(body.status),
          stringValue(body.description),
          actorId,
          id,
        ]
      ),
      "字典项不存在"
    );
    return getDictItem(id);
  } catch (error) {
    duplicateToConflict(error, "同一字典类型下字典值已存在");
  }
}

export async function updateDictItemStatus(
  id: number,
  status: unknown,
  actorId: number | null
): Promise<DictItem> {
  assertAffected(
    await execute(
      `UPDATE dict_items SET status = ?, updated_by = ?
       WHERE id = ? AND deleted = 0`,
      [statusValue(status), actorId, id]
    ),
    "字典项不存在"
  );
  return getDictItem(id);
}

export async function sortDictItems(
  input: unknown,
  actorId: number | null
): Promise<{ message: string }> {
  const body = bodyOf(input);
  const items = Array.isArray(body.items) ? body.items : [];
  for (const item of items) {
    const row = bodyOf(item);
    const id = Number(row.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    await execute(
      `UPDATE dict_items SET sort_order = ?, updated_by = ?
       WHERE id = ? AND deleted = 0`,
      [Number(row.sortOrder ?? 0), actorId, id]
    );
  }
  return { message: "排序成功" };
}

export async function deleteDictItem(
  id: number,
  actorId: number | null
): Promise<void> {
  assertAffected(
    await execute(
      `UPDATE dict_items SET deleted = 1, updated_by = ?
       WHERE id = ? AND deleted = 0`,
      [actorId, id]
    ),
    "字典项不存在"
  );
}

export async function listDictOptions(
  dictCode: string,
  query: Query
): Promise<DictOption[]> {
  const enabledOnly = query.enabledOnly !== "false" && query.enabledOnly !== false;
  const conditions = ["dt.dict_code = ?", "dt.deleted = 0", "di.deleted = 0"];
  const params: SqlParams = [dictCode];
  if (enabledOnly) {
    conditions.push("dt.status = 1", "di.status = 1");
  }

  return list<DictOption>(
    `SELECT di.id, di.item_label AS label, di.item_value AS value, di.status
     FROM dict_types dt
     INNER JOIN dict_items di ON di.dict_type_id = dt.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY di.sort_order ASC, di.id ASC`,
    params
  );
}
