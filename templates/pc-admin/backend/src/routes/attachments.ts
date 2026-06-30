import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import { AppError } from "../utils/errors";
import { sendSuccess } from "../utils/response";
import {
  deleteAttachment,
  getAttachmentFile,
  getAttachmentPreview,
  listAttachments,
  saveAttachment,
  streamAttachment,
} from "../services/attachments";
import { recordOperationLog } from "../services/operation-logs";

interface IdParams {
  id: string;
}

function currentUserId(request: FastifyRequest): number {
  const userId = request.user?.userId;
  if (!userId) throw new AppError("UNAUTHORIZED", "未登录");
  return userId;
}

async function record(
  request: FastifyRequest,
  operationType: string,
  requestParams?: unknown
) {
  await recordOperationLog({
    operatorId: request.user?.userId ?? null,
    moduleCode: "ATTACHMENT",
    operationType,
    requestMethod: request.method,
    requestPath: request.url,
    requestParams,
  });
}

export default async function attachmentRoutes(app: FastifyInstance): Promise<void> {
  await app.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024,
      files: 1,
    },
  });

  app.get("/attachments", async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(
      sendSuccess(await listAttachments(request.query as Record<string, unknown>))
    );
  });

  app.post("/attachments", async (request: FastifyRequest, reply: FastifyReply) => {
    const file = await request.file();
    if (!file) throw new AppError("VALIDATION_ERROR", "请选择上传文件");

    const attachment = await saveAttachment(file, currentUserId(request));
    await record(request, "UPLOAD", {
      id: attachment.id,
      originalName: attachment.originalName,
      businessModule: attachment.businessModule,
      businessRecordId: attachment.businessRecordId,
    });
    return reply.send(sendSuccess(attachment));
  });

  app.get(
    "/attachments/:id/download",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      const { item, path } = await getAttachmentFile(Number(request.params.id));
      return reply
        .header("Content-Type", item.mimeType)
        .header(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(item.originalName)}"`
        )
        .send(streamAttachment(path));
    }
  );

  app.get(
    "/attachments/:id/preview",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      const { item, path } = await getAttachmentPreview(Number(request.params.id));
      return reply.header("Content-Type", item.mimeType).send(streamAttachment(path));
    }
  );

  app.delete(
    "/attachments/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      await deleteAttachment(Number(request.params.id), request.user?.userId ?? null);
      await record(request, "DELETE", { id: request.params.id });
      return reply.send(sendSuccess({ message: "删除成功" }));
    }
  );
}
