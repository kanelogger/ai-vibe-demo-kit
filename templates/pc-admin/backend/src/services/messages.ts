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

export interface MessageListItem {
  id: number;
  title: string;
  messageType: string;
  summary: string | null;
  readStatus: number;
  sentAt: string;
  readAt: string | null;
}

export interface MessageDetail extends MessageListItem {
  content: string;
  senderId: number | null;
}

function stringValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
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

function buildMessageFilter(
  userId: number,
  query: Query
): { where: string; params: SqlParams } {
  const conditions = ["receiver_id = ?", "deleted = 0"];
  const params: SqlParams = [userId];

  const title = stringValue(query.title);
  if (title) {
    conditions.push("title LIKE ?");
    params.push(`%${title}%`);
  }

  const messageType = stringValue(query.messageType);
  if (messageType) {
    conditions.push("message_type = ?");
    params.push(messageType);
  }

  if (query.readStatus !== undefined && query.readStatus !== "") {
    conditions.push("read_status = ?");
    params.push(Number(query.readStatus));
  }

  const sentStartAt = stringValue(query.sentStartAt);
  if (sentStartAt) {
    conditions.push("sent_at >= ?");
    params.push(sentStartAt);
  }

  const sentEndAt = stringValue(query.sentEndAt);
  if (sentEndAt) {
    conditions.push("sent_at <= ?");
    params.push(sentEndAt);
  }

  return { where: conditions.join(" AND "), params };
}

export async function listMessages(userId: number, query: Query) {
  const { page, pageSize } = parsePaginationParams(query);
  const { limit, offset } = buildLimitClause(page, pageSize);
  const { where, params } = buildMessageFilter(userId, query);

  const rows = await list<MessageListItem>(
    `SELECT id, title, message_type AS messageType, summary,
            read_status AS readStatus, sent_at AS sentAt, read_at AS readAt
     FROM messages
     WHERE ${where}
     ORDER BY sent_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const totalItems = await count(
    `SELECT COUNT(*) AS total FROM messages WHERE ${where}`,
    params
  );

  return buildPaginatedResult(rows, totalItems, page, pageSize);
}

export async function getMessageDetail(
  userId: number,
  id: number
): Promise<MessageDetail> {
  const row = await first<MessageDetail>(
    `SELECT id, sender_id AS senderId, title, summary, content,
            message_type AS messageType, read_status AS readStatus,
            sent_at AS sentAt, read_at AS readAt
     FROM messages
     WHERE id = ? AND receiver_id = ? AND deleted = 0
     LIMIT 1`,
    [id, userId]
  );
  if (!row) throw new AppError("NOT_FOUND", "消息不存在");
  return row;
}

export async function markMessageRead(
  userId: number,
  id: number
): Promise<MessageDetail> {
  await execute(
    `UPDATE messages
     SET read_status = 1, read_at = COALESCE(read_at, NOW()), updated_by = ?
     WHERE id = ? AND receiver_id = ? AND deleted = 0`,
    [userId, id, userId]
  );
  return getMessageDetail(userId, id);
}

export async function markMessagesRead(
  userId: number,
  input: unknown
): Promise<{ message: string; count: number }> {
  const body = bodyOf(input);
  if (body.all === true) {
    const result = await execute(
      `UPDATE messages
       SET read_status = 1, read_at = COALESCE(read_at, NOW()), updated_by = ?
       WHERE receiver_id = ? AND read_status = 0 AND deleted = 0`,
      [userId, userId]
    );
    return { message: "已全部标记为已读", count: result.affectedRows };
  }

  const ids = Array.isArray(body.ids)
    ? body.ids
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)
    : [];
  if (ids.length === 0) {
    throw new AppError("VALIDATION_ERROR", "ids 和 all 必须二选一");
  }

  const placeholders = ids.map(() => "?").join(", ");
  const result = await execute(
    `UPDATE messages
     SET read_status = 1, read_at = COALESCE(read_at, NOW()), updated_by = ?
     WHERE receiver_id = ? AND id IN (${placeholders}) AND deleted = 0`,
    [userId, userId, ...ids]
  );
  return { message: "已标记为已读", count: result.affectedRows };
}

export async function countUnreadMessages(
  userId: number
): Promise<{ count: number }> {
  return {
    count: await count(
      `SELECT COUNT(*) AS total FROM messages
       WHERE receiver_id = ? AND read_status = 0 AND deleted = 0`,
      [userId]
    ),
  };
}
