import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../utils/response";
import {
  createOrgEntity,
  deleteOrgEntity,
  getOrgEntity,
  listOrgEntities,
  updateOrgEntity,
  updateOrgEntityStatus,
} from "../services/org-management";
import { recordOperationLog } from "../services/operation-logs";

interface IdParams {
  id: string;
}

function actorId(request: FastifyRequest): number | null {
  return request.user?.userId ?? null;
}

function moduleCode(kind: "department" | "post"): string {
  return kind === "department" ? "DEPARTMENT" : "POST";
}

export default async function orgManagementRoutes(
  app: FastifyInstance
): Promise<void> {
  app.get("/departments", async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(
      sendSuccess(
        await listOrgEntities(
          "department",
          request.query as Record<string, unknown>
        )
      )
    );
  });

  app.post("/departments", async (request: FastifyRequest, reply: FastifyReply) => {
    const department = await createOrgEntity("department", request.body, actorId(request));
    await recordOperationLog({
      operatorId: actorId(request),
      moduleCode: moduleCode("department"),
      operationType: "CREATE",
      requestMethod: request.method,
      requestPath: request.url,
      requestParams: request.body,
    });
    return reply.send(sendSuccess(department));
  });

  app.get(
    "/departments/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      return reply.send(
        sendSuccess(await getOrgEntity("department", Number(request.params.id)))
      );
    }
  );

  app.patch(
    "/departments/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      const department = await updateOrgEntity(
        "department",
        Number(request.params.id),
        request.body,
        actorId(request)
      );
      await recordOperationLog({
        operatorId: actorId(request),
        moduleCode: moduleCode("department"),
        operationType: "UPDATE",
        requestMethod: request.method,
        requestPath: request.url,
        requestParams: { id: request.params.id, body: request.body },
      });
      return reply.send(
        sendSuccess(department)
      );
    }
  );

  app.patch(
    "/departments/:id/status",
    async (
      request: FastifyRequest<{ Params: IdParams; Body: { status?: number } }>,
      reply: FastifyReply
    ) => {
      const department = await updateOrgEntityStatus(
        "department",
        Number(request.params.id),
        request.body?.status,
        actorId(request)
      );
      await recordOperationLog({
        operatorId: actorId(request),
        moduleCode: moduleCode("department"),
        operationType: "STATUS",
        requestMethod: request.method,
        requestPath: request.url,
        requestParams: { id: request.params.id, body: request.body },
      });
      return reply.send(
        sendSuccess(department)
      );
    }
  );

  app.delete(
    "/departments/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      await deleteOrgEntity("department", Number(request.params.id), actorId(request));
      await recordOperationLog({
        operatorId: actorId(request),
        moduleCode: moduleCode("department"),
        operationType: "DELETE",
        requestMethod: request.method,
        requestPath: request.url,
        requestParams: { id: request.params.id },
      });
      return reply.send(sendSuccess({ message: "删除成功" }));
    }
  );

  app.get("/posts", async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(
      sendSuccess(await listOrgEntities("post", request.query as Record<string, unknown>))
    );
  });

  app.post("/posts", async (request: FastifyRequest, reply: FastifyReply) => {
    const post = await createOrgEntity("post", request.body, actorId(request));
    await recordOperationLog({
      operatorId: actorId(request),
      moduleCode: moduleCode("post"),
      operationType: "CREATE",
      requestMethod: request.method,
      requestPath: request.url,
      requestParams: request.body,
    });
    return reply.send(sendSuccess(post));
  });

  app.get(
    "/posts/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      return reply.send(
        sendSuccess(await getOrgEntity("post", Number(request.params.id)))
      );
    }
  );

  app.patch(
    "/posts/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      const post = await updateOrgEntity(
        "post",
        Number(request.params.id),
        request.body,
        actorId(request)
      );
      await recordOperationLog({
        operatorId: actorId(request),
        moduleCode: moduleCode("post"),
        operationType: "UPDATE",
        requestMethod: request.method,
        requestPath: request.url,
        requestParams: { id: request.params.id, body: request.body },
      });
      return reply.send(
        sendSuccess(post)
      );
    }
  );

  app.patch(
    "/posts/:id/status",
    async (
      request: FastifyRequest<{ Params: IdParams; Body: { status?: number } }>,
      reply: FastifyReply
    ) => {
      const post = await updateOrgEntityStatus(
        "post",
        Number(request.params.id),
        request.body?.status,
        actorId(request)
      );
      await recordOperationLog({
        operatorId: actorId(request),
        moduleCode: moduleCode("post"),
        operationType: "STATUS",
        requestMethod: request.method,
        requestPath: request.url,
        requestParams: { id: request.params.id, body: request.body },
      });
      return reply.send(
        sendSuccess(post)
      );
    }
  );

  app.delete(
    "/posts/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      await deleteOrgEntity("post", Number(request.params.id), actorId(request));
      await recordOperationLog({
        operatorId: actorId(request),
        moduleCode: moduleCode("post"),
        operationType: "DELETE",
        requestMethod: request.method,
        requestPath: request.url,
        requestParams: { id: request.params.id },
      });
      return reply.send(sendSuccess({ message: "删除成功" }));
    }
  );
}
