import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import { pool, withTransaction } from "../db/mysql";
import { AppError } from "../utils/errors";
import { buildTree, type TreeNode } from "../utils/tree";

type Body = Record<string, unknown>;
type SqlParam = string | number | null;
type SqlParams = SqlParam[];

export interface MenuDetail {
  id: number;
  menuName: string;
  menuCode: string;
  parentId: number | null;
  icon: string | null;
  sortOrder: number;
  routePath: string;
  componentPath: string | null;
  visible: number;
  status: number;
  roleIds: number[];
  children?: MenuDetail[];
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

function nullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}

function statusValue(value: unknown): number {
  const status = Number(value);
  return status === 0 ? 0 : 1;
}

function bodyOf(input: unknown): Body {
  return input && typeof input === "object" ? (input as Body) : {};
}

function idListOf(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
}

function menuMeta(menuName: string, sortOrder: number): string {
  return JSON.stringify({ title: menuName, rank: sortOrder });
}

async function execute(
  sql: string,
  params: SqlParams = []
): Promise<ResultSetHeader> {
  const [result] = await pool.execute(sql, params);
  return result as ResultSetHeader;
}

async function executeWithConnection(
  connection: PoolConnection,
  sql: string,
  params: SqlParams = []
): Promise<ResultSetHeader> {
  const [result] = await connection.execute(sql, params);
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

function assertAffected(result: ResultSetHeader, message: string): void {
  if (result.affectedRows === 0) throw new AppError("NOT_FOUND", message);
}

function handleDuplicate(error: unknown): never {
  if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
    throw new AppError("CONFLICT", "菜单编码已存在");
  }
  throw error;
}

async function getMenuRoleIds(menuId: number): Promise<number[]> {
  const rows = await list<{ role_id: number }>(
    `SELECT role_id FROM role_menus
     WHERE menu_id = ? AND deleted = 0
     ORDER BY role_id ASC`,
    [menuId]
  );
  return rows.map((row) => row.role_id);
}

async function replaceMenuRoles(
  connection: PoolConnection,
  menuId: number,
  roleIds: number[],
  actorId: number | null
): Promise<void> {
  await executeWithConnection(
    connection,
    `UPDATE role_menus SET deleted = 1, updated_by = ? WHERE menu_id = ?`,
    [actorId, menuId]
  );

  for (const roleId of roleIds) {
    await executeWithConnection(
      connection,
      `INSERT INTO role_menus (role_id, menu_id, created_by, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE deleted = 0, updated_by = VALUES(updated_by)`,
      [roleId, menuId, actorId, actorId]
    );
  }
}

export async function listMenuTree(): Promise<MenuDetail[]> {
  const rows = await list<Omit<MenuDetail, "roleIds">>(
    `SELECT id, menu_name AS menuName, menu_code AS menuCode,
            parent_id AS parentId, icon, sort_order AS sortOrder,
            route_path AS routePath, component_path AS componentPath,
            visible, status
     FROM menus
     WHERE deleted = 0
     ORDER BY COALESCE(parent_id, 0), sort_order ASC, id ASC`
  );

  const menus = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      roleIds: await getMenuRoleIds(row.id),
    }))
  );

  return buildTree(menus as Array<MenuDetail & TreeNode>);
}

export async function getMenuDetail(id: number): Promise<MenuDetail> {
  const row = await first<Omit<MenuDetail, "roleIds">>(
    `SELECT id, menu_name AS menuName, menu_code AS menuCode,
            parent_id AS parentId, icon, sort_order AS sortOrder,
            route_path AS routePath, component_path AS componentPath,
            visible, status
     FROM menus
     WHERE id = ? AND deleted = 0
     LIMIT 1`,
    [id]
  );
  if (!row) throw new AppError("NOT_FOUND", "菜单不存在");
  return {
    ...row,
    roleIds: await getMenuRoleIds(id),
  };
}

export async function createMenu(
  input: unknown,
  actorId: number | null
): Promise<MenuDetail> {
  const body = bodyOf(input);
  const roleIds = idListOf(body.roleIds);

  try {
    const id = await withTransaction(async (connection) => {
      const menuName = requiredString(body, "menuName", "菜单名称");
      const sortOrder = Number(body.sortOrder ?? 0);
      const result = await executeWithConnection(
        connection,
        `INSERT INTO menus
           (menu_code, menu_name, parent_id, icon, sort_order, route_path,
            component_path, visible, status, meta_json, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          requiredString(body, "menuCode", "菜单编码"),
          menuName,
          nullableNumber(body.parentId),
          stringValue(body.icon),
          sortOrder,
          requiredString(body, "routePath", "路由地址"),
          stringValue(body.componentPath),
          statusValue(body.visible),
          statusValue(body.status),
          menuMeta(menuName, sortOrder),
          actorId,
          actorId,
        ]
      );
      await replaceMenuRoles(connection, result.insertId, roleIds, actorId);
      return result.insertId;
    });
    return getMenuDetail(id);
  } catch (error) {
    handleDuplicate(error);
  }
}

export async function updateMenu(
  id: number,
  input: unknown,
  actorId: number | null
): Promise<MenuDetail> {
  const body = bodyOf(input);
  const roleIds = idListOf(body.roleIds);

  try {
    await withTransaction(async (connection) => {
      const menuName = requiredString(body, "menuName", "菜单名称");
      const sortOrder = Number(body.sortOrder ?? 0);
      assertAffected(
        await executeWithConnection(
          connection,
          `UPDATE menus
           SET menu_code = ?, menu_name = ?, parent_id = ?, icon = ?,
               sort_order = ?, route_path = ?, component_path = ?,
               visible = ?, status = ?, meta_json = ?, updated_by = ?
           WHERE id = ? AND deleted = 0`,
          [
            requiredString(body, "menuCode", "菜单编码"),
            menuName,
            nullableNumber(body.parentId),
            stringValue(body.icon),
            sortOrder,
            requiredString(body, "routePath", "路由地址"),
            stringValue(body.componentPath),
            statusValue(body.visible),
            statusValue(body.status),
            menuMeta(menuName, sortOrder),
            actorId,
            id,
          ]
        ),
        "菜单不存在"
      );
      await replaceMenuRoles(connection, id, roleIds, actorId);
    });
    return getMenuDetail(id);
  } catch (error) {
    handleDuplicate(error);
  }
}

export async function updateMenuStatus(
  id: number,
  status: unknown,
  actorId: number | null
): Promise<MenuDetail> {
  assertAffected(
    await execute(
      `UPDATE menus SET status = ?, updated_by = ? WHERE id = ? AND deleted = 0`,
      [statusValue(status), actorId, id]
    ),
    "菜单不存在"
  );
  return getMenuDetail(id);
}

export async function updateMenuRoles(
  id: number,
  input: unknown,
  actorId: number | null
): Promise<MenuDetail> {
  await getMenuDetail(id);
  await withTransaction(async (connection) => {
    await replaceMenuRoles(connection, id, idListOf(bodyOf(input).roleIds), actorId);
  });
  return getMenuDetail(id);
}

export async function sortMenuTree(
  input: unknown,
  actorId: number | null
): Promise<{ message: string }> {
  const items = Array.isArray(bodyOf(input).items)
    ? (bodyOf(input).items as Body[])
    : [];

  await withTransaction(async (connection) => {
    for (const item of items) {
      const id = Number(item.id);
      if (!Number.isInteger(id) || id <= 0) continue;
      await executeWithConnection(
        connection,
        `UPDATE menus SET parent_id = ?, sort_order = ?, updated_by = ?
         WHERE id = ? AND deleted = 0`,
        [nullableNumber(item.parentId), Number(item.sortOrder ?? 0), actorId, id]
      );
    }
  });

  return { message: "排序已保存" };
}

export async function deleteMenu(
  id: number,
  actorId: number | null
): Promise<void> {
  const child = await first<{ id: number }>(
    `SELECT id FROM menus WHERE parent_id = ? AND deleted = 0 LIMIT 1`,
    [id]
  );
  if (child) throw new AppError("VALIDATION_ERROR", "存在子菜单，不能删除");

  assertAffected(
    await execute(
      `UPDATE menus SET deleted = 1, updated_by = ? WHERE id = ? AND deleted = 0`,
      [actorId, id]
    ),
    "菜单不存在"
  );
}
