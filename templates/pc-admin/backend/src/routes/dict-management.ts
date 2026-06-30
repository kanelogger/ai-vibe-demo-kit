import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../utils/response";
import {
  createDictItem,
  createDictType,
  deleteDictItem,
  deleteDictType,
  getDictType,
  listDictItems,
  listDictOptions,
  listDictTypes,
  sortDictItems,
  updateDictItem,
  updateDictItemStatus,
  updateDictType,
  updateDictTypeStatus,
} from "../services/dict-management";
import { recordOperationLog } from "../services/operation-logs";

interface IdParams {
  id: string;
}

interface DictCodeParams {
  dictCode: string;
}

function actorId(request: FastifyRequest): number | null {
  return request.user?.userId ?? null;
}

async function record(
  request: FastifyRequest,
  operationType: string,
  requestParams?: unknown
) {
  await recordOperationLog({
    operatorId: actorId(request),
    moduleCode: "DICT",
    operationType,
    requestMethod: request.method,
    requestPath: request.url,
    requestParams,
  });
}

export default async function dictManagementRoutes(
  app: FastifyInstance
): Promise<void> {
  app.get("/dict-types", async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(
      sendSuccess(await listDictTypes(request.query as Record<string, unknown>))
    );
  });

  app.post("/dict-types", async (request: FastifyRequest, reply: FastifyReply) => {
    const dictType = await createDictType(request.body, actorId(request));
    await record(request, "CREATE_TYPE", request.body);
    return reply.send(sendSuccess(dictType));
  });

  app.get(
    "/dict-types/by-code/:dictCode/options",
    async (
      request: FastifyRequest<{ Params: DictCodeParams }>,
      reply: FastifyReply
    ) => {
      return reply.send(
        sendSuccess(
          await listDictOptions(
            request.params.dictCode,
            request.query as Record<string, unknown>
          )
        )
      );
    }
  );

  app.get(
    "/dict-types/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      return reply.send(sendSuccess(await getDictType(Number(request.params.id))));
    }
  );

  app.patch(
    "/dict-types/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      const dictType = await updateDictType(
        Number(request.params.id),
        request.body,
        actorId(request)
      );
      await record(request, "UPDATE_TYPE", {
        id: request.params.id,
        body: request.body,
      });
      return reply.send(sendSuccess(dictType));
    }
  );

  app.patch(
    "/dict-types/:id/status",
    async (
      request: FastifyRequest<{ Params: IdParams; Body: { status?: number } }>,
      reply: FastifyReply
    ) => {
      const dictType = await updateDictTypeStatus(
        Number(request.params.id),
        request.body?.status,
        actorId(request)
      );
      await record(request, "STATUS_TYPE", {
        id: request.params.id,
        body: request.body,
      });
      return reply.send(sendSuccess(dictType));
    }
  );

  app.delete(
    "/dict-types/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      await deleteDictType(Number(request.params.id), actorId(request));
      await record(request, "DELETE_TYPE", { id: request.params.id });
      return reply.send(sendSuccess({ message: "删除成功" }));
    }
  );

  app.get(
    "/dict-types/:id/items",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      return reply.send(sendSuccess(await listDictItems(Number(request.params.id))));
    }
  );

  app.post(
    "/dict-types/:id/items",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      const item = await createDictItem(
        Number(request.params.id),
        request.body,
        actorId(request)
      );
      await record(request, "CREATE_ITEM", {
        dictTypeId: request.params.id,
        body: request.body,
      });
      return reply.send(sendSuccess(item));
    }
  );

  app.patch("/dict-items/batch-sort", async (request, reply) => {
    const result = await sortDictItems(request.body, actorId(request));
    await record(request, "SORT_ITEM", request.body);
    return reply.send(sendSuccess(result));
  });

  app.patch(
    "/dict-items/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      const item = await updateDictItem(
        Number(request.params.id),
        request.body,
        actorId(request)
      );
      await record(request, "UPDATE_ITEM", {
        id: request.params.id,
        body: request.body,
      });
      return reply.send(sendSuccess(item));
    }
  );

  app.patch(
    "/dict-items/:id/status",
    async (
      request: FastifyRequest<{ Params: IdParams; Body: { status?: number } }>,
      reply: FastifyReply
    ) => {
      const item = await updateDictItemStatus(
        Number(request.params.id),
        request.body?.status,
        actorId(request)
      );
      await record(request, "STATUS_ITEM", {
        id: request.params.id,
        body: request.body,
      });
      return reply.send(sendSuccess(item));
    }
  );

  app.delete(
    "/dict-items/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      await deleteDictItem(Number(request.params.id), actorId(request));
      await record(request, "DELETE_ITEM", { id: request.params.id });
      return reply.send(sendSuccess({ message: "删除成功" }));
    }
  );
}
