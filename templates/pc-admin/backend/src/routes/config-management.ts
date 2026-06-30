import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../utils/response";
import {
  createSystemConfig,
  deleteSystemConfig,
  getSystemConfig,
  getSystemConfigValue,
  listSystemConfigs,
  updateSystemConfig,
  updateSystemConfigStatus,
} from "../services/config-management";
import { recordOperationLog } from "../services/operation-logs";

interface IdParams {
  id: string;
}

interface ConfigCodeParams {
  configCode: string;
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
    moduleCode: "CONFIG",
    operationType,
    requestMethod: request.method,
    requestPath: request.url,
    requestParams,
  });
}

export default async function configManagementRoutes(
  app: FastifyInstance
): Promise<void> {
  app.get("/system-configs", async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(
      sendSuccess(await listSystemConfigs(request.query as Record<string, unknown>))
    );
  });

  app.post("/system-configs", async (request: FastifyRequest, reply: FastifyReply) => {
    const config = await createSystemConfig(request.body, actorId(request));
    await record(request, "CREATE", request.body);
    return reply.send(sendSuccess(config));
  });

  app.get(
    "/system-configs/by-code/:configCode/value",
    async (
      request: FastifyRequest<{ Params: ConfigCodeParams }>,
      reply: FastifyReply
    ) => {
      return reply.send(
        sendSuccess(await getSystemConfigValue(request.params.configCode))
      );
    }
  );

  app.get(
    "/system-configs/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      return reply.send(
        sendSuccess(await getSystemConfig(Number(request.params.id)))
      );
    }
  );

  app.patch(
    "/system-configs/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      const config = await updateSystemConfig(
        Number(request.params.id),
        request.body,
        actorId(request)
      );
      await record(request, "UPDATE", {
        id: request.params.id,
        body: request.body,
      });
      return reply.send(sendSuccess(config));
    }
  );

  app.patch(
    "/system-configs/:id/status",
    async (
      request: FastifyRequest<{ Params: IdParams; Body: { status?: number } }>,
      reply: FastifyReply
    ) => {
      const config = await updateSystemConfigStatus(
        Number(request.params.id),
        request.body?.status,
        actorId(request)
      );
      await record(request, "STATUS", {
        id: request.params.id,
        body: request.body,
      });
      return reply.send(sendSuccess(config));
    }
  );

  app.delete(
    "/system-configs/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      await deleteSystemConfig(Number(request.params.id), actorId(request));
      await record(request, "DELETE", { id: request.params.id });
      return reply.send(sendSuccess({ message: "删除成功" }));
    }
  );
}
