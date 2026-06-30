import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import { pool, withTransaction } from "../db/mysql";
import { AppError } from "../utils/errors";
import {
  buildLimitClause,
  buildPaginatedResult,
  parsePaginationParams,
} from "../utils/pagination";
import { buildTree, type TreeNode } from "../utils/tree";

type Query = Record<string, unknown>;
type Body = Record<string, unknown>;
type SqlParam = string | number | null;
type SqlParams = SqlParam[];

interface CountRow {
  total: number;
}

export interface RoleListItem {
  id: number;
  roleName: string;
  roleCode: string;
  status: number;
  description: string | null;
  isSuperAdmin: boolean;
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoleDetail extends RoleListItem {
  menuIds: number[];
}

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

interface RoleRow {
  id: number;
  roleName: string;
  roleCode: string;
  status: number;
  description: string | null;
  isSuperAdmin: number;
  userCount: number;
  createdAt: string;
  updatedAt: string;
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

function idListOf(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
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

async function count(sql: string, params: SqlParams = []): Promise<number> {
  const row = await first<CountRow>(sql, params);
  return Number(row?.total ?? 0);
}

function assertAffected(result: ResultSetHeader, message: string): void {
  if (result.affectedRows === 0) throw new AppError("NOT_FOUND", message);
}

function handleDuplicate(error: unknown): never {
  if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
    throw new AppError("CONFLICT", "角色编码已存在");
  }
  throw error;
}

function mapRole(row: RoleRow): RoleListItem {
  return {
    ...row,
    isSuperAdmin: Boolean(row.isSuperAdmin),
  };
}

function buildRoleFilter(query: Query): { where: string; params: SqlParams } {
  const conditions = ["r.deleted = 0"];
  const params: SqlParams = [];

  const roleName = stringValue(query.roleName);
  if (roleName) {
    conditions.push("r.role_name LIKE ?");
    params.push(`%${roleName}%`);
  }

  const roleCode = stringValue(query.roleCode);
  if (roleCode) {
    conditions.push("r.role_code LIKE ?");
    params.push(`%${roleCode}%`);
  }

  if (query.status !== undefined && query.status !== "") {
    conditions.push("r.status = ?");
    params.push(Number(query.status));
  }

  return { where: conditions.join(" AND "), params };
}

async function getRoleMenuIds(roleId: number): Promise<number[]> {
  const rows = await list<{ menu_id: number }>(
    `SELECT menu_id FROM role_menus
     WHERE role_id = ? AND deleted = 0
     ORDER BY menu_id ASC`,
    [roleId]
  );
  return rows.map((row) => row.menu_id);
}

async function replaceRoleMenus(
  connection: PoolConnection,
  roleId: number,
  menuIds: number[],
  actorId: number | null
): Promise<void> {
  await executeWithConnection(
    connection,
    `UPDATE role_menus SET deleted = 1, updated_by = ? WHERE role_id = ?`,
    [actorId, roleId]
  );

  for (const menuId of menuIds) {
    await executeWithConnection(
      connection,
      `INSERT INTO role_menus (role_id, menu_id, created_by, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE deleted = 0, updated_by = VALUES(updated_by)`,
      [roleId, menuId, actorId, actorId]
    );
  }
}

async function replaceRoleUsers(
  connection: PoolConnection,
  roleId: number,
  userIds: number[],
  actorId: number | null
): Promise<void> {
  await executeWithConnection(
    connection,
    `UPDATE user_roles SET deleted = 1, updated_by = ? WHERE role_id = ?`,
    [actorId, roleId]
  );

  for (const userId of userIds) {
    await executeWithConnection(
      connection,
      `INSERT INTO user_roles (user_id, role_id, created_by, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE deleted = 0, updated_by = VALUES(updated_by)`,
      [userId, roleId, actorId, actorId]
    );
  }
}

export async function listRoles(query: Query) {
  const { page, pageSize } = parsePaginationParams(query);
  const { limit, offset } = buildLimitClause(page, pageSize);
  const { where, params } = buildRoleFilter(query);

  const rows = await list<RoleRow>(
    `SELECT r.id, r.role_name AS roleName, r.role_code AS roleCode,
            r.status, r.description, r.is_super_admin AS isSuperAdmin,
            COUNT(CASE WHEN ur.deleted = 0 THEN ur.id END) AS userCount,
            r.created_at AS createdAt, r.updated_at AS updatedAt
     FROM roles r
     LEFT JOIN user_roles ur ON ur.role_id = r.id
     WHERE ${where}
     GROUP BY r.id
     ORDER BY r.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const totalItems = await count(
    `SELECT COUNT(*) AS total FROM roles r WHERE ${where}`,
    params
  );

  return buildPaginatedResult(rows.map(mapRole), totalItems, page, pageSize);
}

export async function getRoleDetail(id: number): Promise<RoleDetail> {
  const row = await first<RoleRow>(
    `SELECT r.id, r.role_name AS roleName, r.role_code AS roleCode,
            r.status, r.description, r.is_super_admin AS isSuperAdmin,
            COUNT(CASE WHEN ur.deleted = 0 THEN ur.id END) AS userCount,
            r.created_at AS createdAt, r.updated_at AS updatedAt
     FROM roles r
     LEFT JOIN user_roles ur ON ur.role_id = r.id
     WHERE r.id = ? AND r.deleted = 0
     GROUP BY r.id
     LIMIT 1`,
    [id]
  );
  if (!row) throw new AppError("NOT_FOUND", "角色不存在");
  return {
    ...mapRole(row),
    menuIds: await getRoleMenuIds(id),
  };
}

export async function createRole(
  input: unknown,
  actorId: number | null
): Promise<RoleDetail> {
  const body = bodyOf(input);
  const menuIds = idListOf(body.menuIds);

  try {
    const id = await withTransaction(async (connection) => {
      const result = await executeWithConnection(
        connection,
        `INSERT INTO roles
           (role_code, role_name, status, description, is_super_admin, created_by, updated_by)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
        [
          requiredString(body, "roleCode", "角色编码"),
          requiredString(body, "roleName", "角色名称"),
          statusValue(body.status),
          stringValue(body.description),
          actorId,
          actorId,
        ]
      );
      await replaceRoleMenus(connection, result.insertId, menuIds, actorId);
      return result.insertId;
    });
    return getRoleDetail(id);
  } catch (error) {
    handleDuplicate(error);
  }
}

export async function updateRole(
  id: number,
  input: unknown,
  actorId: number | null
): Promise<RoleDetail> {
  const body = bodyOf(input);
  const menuIds = idListOf(body.menuIds);

  try {
    await withTransaction(async (connection) => {
      assertAffected(
        await executeWithConnection(
          connection,
          `UPDATE roles
           SET role_name = ?, status = ?, description = ?, updated_by = ?
           WHERE id = ? AND deleted = 0`,
          [
            requiredString(body, "roleName", "角色名称"),
            statusValue(body.status),
            stringValue(body.description),
            actorId,
            id,
          ]
        ),
        "角色不存在"
      );
      await replaceRoleMenus(connection, id, menuIds, actorId);
    });
    return getRoleDetail(id);
  } catch (error) {
    handleDuplicate(error);
  }
}

export async function updateRoleStatus(
  id: number,
  status: unknown,
  actorId: number | null
): Promise<RoleDetail> {
  assertAffected(
    await execute(
      `UPDATE roles SET status = ?, updated_by = ? WHERE id = ? AND deleted = 0`,
      [statusValue(status), actorId, id]
    ),
    "角色不存在"
  );
  return getRoleDetail(id);
}

export async function deleteRole(
  id: number,
  actorId: number | null
): Promise<void> {
  const userCount = await count(
    `SELECT COUNT(*) AS total FROM user_roles WHERE role_id = ? AND deleted = 0`,
    [id]
  );
  if (userCount > 0) {
    throw new AppError("ROLE_IN_USE", "角色已被用户使用，不能删除");
  }

  assertAffected(
    await execute(
      `UPDATE roles SET deleted = 1, updated_by = ? WHERE id = ? AND deleted = 0`,
      [actorId, id]
    ),
    "角色不存在"
  );
}

export async function listRoleUsers(roleId: number, query: Query) {
  await getRoleDetail(roleId);

  const { page, pageSize } = parsePaginationParams(query);
  const { limit, offset } = buildLimitClause(page, pageSize);
  const rows = await list(
    `SELECT u.id, u.user_code AS userCode, u.login_name AS username,
            u.display_name AS nickname, u.phone, u.email, u.status,
            u.created_at AS createdAt
     FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.id
     WHERE ur.role_id = ? AND ur.deleted = 0 AND u.deleted = 0
     ORDER BY u.id DESC
     LIMIT ? OFFSET ?`,
    [roleId, limit, offset]
  );
  const totalItems = await count(
    `SELECT COUNT(*) AS total
     FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.id
     WHERE ur.role_id = ? AND ur.deleted = 0 AND u.deleted = 0`,
    [roleId]
  );

  return buildPaginatedResult(rows, totalItems, page, pageSize);
}

export async function updateRoleUsers(
  roleId: number,
  input: unknown,
  actorId: number | null
) {
  await getRoleDetail(roleId);
  const userIds = idListOf(bodyOf(input).userIds);
  await withTransaction(async (connection) => {
    await replaceRoleUsers(connection, roleId, userIds, actorId);
  });
  return listRoleUsers(roleId, { page: 1, pageSize: 100 });
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
