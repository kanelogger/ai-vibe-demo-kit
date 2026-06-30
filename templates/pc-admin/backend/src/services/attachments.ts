import { createReadStream, createWriteStream } from "fs";
import { mkdir, stat } from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";
import { randomUUID } from "crypto";
import type { MultipartFile } from "@fastify/multipart";
import type { ResultSetHeader } from "mysql2/promise";
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

export interface AttachmentItem {
  id: number;
  originalName: string;
  storedName: string;
  url: string;
  mimeType: string;
  fileExt: string;
  fileSize: number;
  businessModule: string | null;
  businessRecordId: number | null;
  referenceStatus: number;
  uploadUserId: number;
  uploadedAt: string;
}

export interface AttachmentFile {
  item: AttachmentItem;
  path: string;
}

const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads", "attachments");

function stringValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function nullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
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

function mapUploadFields(fields: MultipartFile["fields"]): {
  businessModule: string | null;
  businessRecordId: number | null;
} {
  const fieldValue = (key: string) => {
    const field = fields[key];
    if (!field || Array.isArray(field) || field.type !== "field") return null;
    return field.value;
  };

  return {
    businessModule: stringValue(fieldValue("businessModule")),
    businessRecordId: nullableNumber(fieldValue("businessRecordId")),
  };
}

function buildAttachmentFilter(query: Query): { where: string; params: SqlParams } {
  const conditions = ["deleted = 0"];
  const params: SqlParams = [];

  const originalName = stringValue(query.originalName);
  if (originalName) {
    conditions.push("original_name LIKE ?");
    params.push(`%${originalName}%`);
  }

  const businessModule = stringValue(query.businessModule);
  if (businessModule) {
    conditions.push("business_module = ?");
    params.push(businessModule);
  }

  if (query.referenceStatus !== undefined && query.referenceStatus !== "") {
    conditions.push("reference_status = ?");
    params.push(Number(query.referenceStatus));
  }

  return { where: conditions.join(" AND "), params };
}

export async function listAttachments(query: Query) {
  const { page, pageSize } = parsePaginationParams(query);
  const { limit, offset } = buildLimitClause(page, pageSize);
  const { where, params } = buildAttachmentFilter(query);

  const rows = await list<AttachmentItem>(
    `SELECT id, original_name AS originalName, stored_name AS storedName,
            file_url AS url, mime_type AS mimeType, file_ext AS fileExt,
            file_size AS fileSize, business_module AS businessModule,
            business_record_id AS businessRecordId,
            reference_status AS referenceStatus, upload_user_id AS uploadUserId,
            uploaded_at AS uploadedAt
     FROM attachments
     WHERE ${where}
     ORDER BY uploaded_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const totalItems = await count(
    `SELECT COUNT(*) AS total FROM attachments WHERE ${where}`,
    params
  );

  return buildPaginatedResult(rows, totalItems, page, pageSize);
}

export async function getAttachment(id: number): Promise<AttachmentItem> {
  const row = await first<AttachmentItem>(
    `SELECT id, original_name AS originalName, stored_name AS storedName,
            file_url AS url, mime_type AS mimeType, file_ext AS fileExt,
            file_size AS fileSize, business_module AS businessModule,
            business_record_id AS businessRecordId,
            reference_status AS referenceStatus, upload_user_id AS uploadUserId,
            uploaded_at AS uploadedAt
     FROM attachments
     WHERE id = ? AND deleted = 0
     LIMIT 1`,
    [id]
  );
  if (!row) throw new AppError("NOT_FOUND", "附件不存在");
  return row;
}

export async function saveAttachment(
  file: MultipartFile,
  userId: number
): Promise<AttachmentItem> {
  const originalName = file.filename || "upload.bin";
  const ext = path.extname(originalName).replace(".", "").toLowerCase() || "bin";
  const storedName = `${randomUUID()}.${ext}`;
  await mkdir(UPLOAD_ROOT, { recursive: true });
  const storedPath = path.join(UPLOAD_ROOT, storedName);
  await pipeline(file.file, createWriteStream(storedPath));
  const fileInfo = await stat(storedPath);
  const { businessModule, businessRecordId } = mapUploadFields(file.fields);

  const result = await execute(
    `INSERT INTO attachments
       (original_name, stored_name, file_url, mime_type, file_ext, file_size,
        business_module, business_record_id, reference_status, upload_user_id,
        created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [
      originalName,
      storedName,
      `/attachments/${storedName}`,
      file.mimetype || "application/octet-stream",
      ext,
      fileInfo.size,
      businessModule,
      businessRecordId,
      userId,
      userId,
      userId,
    ]
  );

  return getAttachment(result.insertId);
}

export async function getAttachmentFile(id: number): Promise<AttachmentFile> {
  const item = await getAttachment(id);
  const filePath = path.join(UPLOAD_ROOT, item.storedName);
  try {
    await stat(filePath);
  } catch {
    throw new AppError("NOT_FOUND", "附件文件不存在");
  }
  return { item, path: filePath };
}

export async function getAttachmentPreview(id: number): Promise<AttachmentFile> {
  const file = await getAttachmentFile(id);
  if (!file.item.mimeType.startsWith("image/")) {
    throw new AppError("UNSUPPORTED_PREVIEW_TYPE", "仅支持图片附件预览");
  }
  return file;
}

export async function deleteAttachment(
  id: number,
  actorId: number | null
): Promise<void> {
  assertAffected(
    await execute(
      `UPDATE attachments
       SET deleted = 1, reference_status = 0, updated_by = ?
       WHERE id = ? AND deleted = 0`,
      [actorId, id]
    ),
    "附件不存在"
  );
}

export function streamAttachment(filePath: string) {
  return createReadStream(filePath);
}
