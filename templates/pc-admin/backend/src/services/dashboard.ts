import { pool } from "../db/mysql";
import { getUserRoles } from "./users";

type SqlParam = string | number | null;
type SqlParams = SqlParam[];

interface CountRow {
  total: number;
}

export interface OperationLogSummary {
  id: number;
  operatorName: string | null;
  moduleCode: string;
  operationType: string;
  requestParams: string | null;
  operationResult: number;
  operatedAt: string;
}

export interface MessageSummary {
  id: number;
  title: string;
  summary: string | null;
  messageType: string;
  readStatus: number;
  sentAt: string;
}

export interface AdminStats {
  userCount: number;
  roleCount: number;
  menuCount: number;
  todayLoginCount: number;
  apiErrorCount: number;
}

export interface DashboardOverview {
  todoCount: number;
  unreadMessageCount: number;
  recentOperations: OperationLogSummary[];
  announcements: MessageSummary[];
  adminStats: AdminStats | null;
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

async function getAdminStats(): Promise<AdminStats> {
  const [userCount, roleCount, menuCount, todayLoginCount, apiErrorCount] =
    await Promise.all([
      count("SELECT COUNT(*) AS total FROM users WHERE deleted = 0"),
      count("SELECT COUNT(*) AS total FROM roles WHERE deleted = 0"),
      count("SELECT COUNT(*) AS total FROM menus WHERE deleted = 0"),
      count(
        `SELECT COUNT(*) AS total FROM login_logs
         WHERE logged_at >= CURRENT_DATE() AND login_result = 1`
      ),
      count(
        `SELECT COUNT(*) AS total FROM exception_logs
         WHERE occurred_at >= CURRENT_DATE()`
      ),
    ]);

  return { userCount, roleCount, menuCount, todayLoginCount, apiErrorCount };
}

export async function getDashboardOverview(
  userId: number
): Promise<DashboardOverview> {
  const roles = await getUserRoles(userId);
  const isAdmin = roles.some((role) => role.roleCode === "SUPER_ADMIN");

  const [unreadMessageCount, recentOperations, announcements, adminStats] =
    await Promise.all([
      count(
        `SELECT COUNT(*) AS total FROM messages
         WHERE receiver_id = ? AND read_status = 0 AND deleted = 0`,
        [userId]
      ),
      list<OperationLogSummary>(
        `SELECT id, operator_name AS operatorName, module_code AS moduleCode,
                operation_type AS operationType, request_params AS requestParams,
                operation_result AS operationResult, operated_at AS operatedAt
         FROM operation_logs
         ORDER BY operated_at DESC, id DESC
         LIMIT 5`
      ),
      list<MessageSummary>(
        `SELECT id, title, summary, message_type AS messageType,
                read_status AS readStatus, sent_at AS sentAt
         FROM messages
         WHERE receiver_id = ? AND message_type = 'ANNOUNCEMENT' AND deleted = 0
         ORDER BY sent_at DESC, id DESC
         LIMIT 5`,
        [userId]
      ),
      isAdmin ? getAdminStats() : Promise.resolve(null),
    ]);

  return {
    todoCount: 0,
    unreadMessageCount,
    recentOperations,
    announcements,
    adminStats,
  };
}
