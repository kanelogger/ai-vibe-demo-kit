import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../utils/response";
import {
  createManagedUser,
  deleteManagedUser,
  getUserDetail,
  listDepartmentOptions,
  listPostOptions,
  listRoleOptions,
  listUsers,
  resetUserPassword,
  updateManagedUser,
  updateUserStatus,
} from "../services/user-management";
import { recordOperationLog } from "../services/operation-logs";

interface IdParams {
  id: string;
}

function actorId(request: FastifyRequest): number | null {
  return request.user?.userId ?? null;
}

export default async function userManagementRoutes(
  app: FastifyInstance
): Promise<void> {
  app.get("/users", async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(
      sendSuccess(await listUsers(request.query as Record<string, unknown>))
    );
  });

  app.post("/users", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await createManagedUser(request.body, actorId(request));
    await recordOperationLog({
      operatorId: actorId(request),
      moduleCode: "USER",
      operationType: "CREATE",
      requestMethod: request.method,
      requestPath: request.url,
      requestParams: request.body,
    });
    return reply.send(sendSuccess(user));
  });

  app.get(
    "/users/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      return reply.send(sendSuccess(await getUserDetail(Number(request.params.id))));
    }
  );

  app.patch(
    "/users/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      const user = await updateManagedUser(
        Number(request.params.id),
        request.body,
        actorId(request)
      );
      await recordOperationLog({
        operatorId: actorId(request),
        moduleCode: "USER",
        operationType: "UPDATE",
        requestMethod: request.method,
        requestPath: request.url,
        requestParams: { id: request.params.id, body: request.body },
      });
      return reply.send(sendSuccess(user));
    }
  );

  app.patch(
    "/users/:id/status",
    async (
      request: FastifyRequest<{ Params: IdParams; Body: { status?: number } }>,
      reply: FastifyReply
    ) => {
      const user = await updateUserStatus(
        Number(request.params.id),
        request.body?.status,
        actorId(request)
      );
      await recordOperationLog({
        operatorId: actorId(request),
        moduleCode: "USER",
        operationType: "STATUS",
        requestMethod: request.method,
        requestPath: request.url,
        requestParams: { id: request.params.id, body: request.body },
      });
      return reply.send(sendSuccess(user));
    }
  );

  app.post(
    "/users/:id/reset-password",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      const result = await resetUserPassword(
        Number(request.params.id),
        request.body,
        actorId(request)
      );
      await recordOperationLog({
        operatorId: actorId(request),
        moduleCode: "USER",
        operationType: "RESET_PASSWORD",
        requestMethod: request.method,
        requestPath: request.url,
        requestParams: { id: request.params.id, body: request.body },
      });
      return reply.send(sendSuccess(result));
    }
  );

  app.delete(
    "/users/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      await deleteManagedUser(Number(request.params.id), actorId(request));
      await recordOperationLog({
        operatorId: actorId(request),
        moduleCode: "USER",
        operationType: "DELETE",
        requestMethod: request.method,
        requestPath: request.url,
        requestParams: { id: request.params.id },
      });
      return reply.send(sendSuccess({ message: "删除成功" }));
    }
  );

  app.get("/departments/options", async (_request, reply) => {
    return reply.send(sendSuccess(await listDepartmentOptions()));
  });

  app.get("/posts/options", async (_request, reply) => {
    return reply.send(sendSuccess(await listPostOptions()));
  });

  app.get("/roles/options", async (_request, reply) => {
    return reply.send(sendSuccess(await listRoleOptions()));
  });
}
