import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../utils/errors";
import { sendSuccess } from "../utils/response";
import {
  countUnreadMessages,
  getMessageDetail,
  listMessages,
  markMessageRead,
  markMessagesRead,
} from "../services/messages";
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
    moduleCode: "MESSAGE",
    operationType,
    requestMethod: request.method,
    requestPath: request.url,
    requestParams,
  });
}

export default async function messageRoutes(app: FastifyInstance): Promise<void> {
  app.get("/messages", async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(
      sendSuccess(
        await listMessages(
          currentUserId(request),
          request.query as Record<string, unknown>
        )
      )
    );
  });

  app.get("/messages/unread-count", async (request, reply) => {
    return reply.send(sendSuccess(await countUnreadMessages(currentUserId(request))));
  });

  app.patch("/messages/read", async (request, reply) => {
    const result = await markMessagesRead(currentUserId(request), request.body);
    await record(request, "BATCH_READ", request.body);
    return reply.send(sendSuccess(result));
  });

  app.get(
    "/messages/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      return reply.send(
        sendSuccess(
          await getMessageDetail(currentUserId(request), Number(request.params.id))
        )
      );
    }
  );

  app.patch(
    "/messages/:id/read",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      const message = await markMessageRead(
        currentUserId(request),
        Number(request.params.id)
      );
      await record(request, "READ", { id: request.params.id });
      return reply.send(sendSuccess(message));
    }
  );
}
