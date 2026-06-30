import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../utils/response";
import {
  createRole,
  deleteRole,
  getRoleDetail,
  listRoles,
  listRoleUsers,
  updateRole,
  updateRoleStatus,
  updateRoleUsers,
} from "../services/role-management";
import { recordOperationLog } from "../services/operation-logs";

interface IdParams {
  id: string;
}

function actorId(request: FastifyRequest): number | null {
  return request.user?.userId ?? null;
}

export default async function roleManagementRoutes(
  app: FastifyInstance
): Promise<void> {
  app.get("/roles", async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(
      sendSuccess(await listRoles(request.query as Record<string, unknown>))
    );
  });

  app.post("/roles", async (request: FastifyRequest, reply: FastifyReply) => {
    const role = await createRole(request.body, actorId(request));
    await recordOperationLog({
      operatorId: actorId(request),
      moduleCode: "ROLE",
      operationType: "CREATE",
      requestMethod: request.method,
      requestPath: request.url,
      requestParams: request.body,
    });
    return reply.send(sendSuccess(role));
  });

  app.get(
    "/roles/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      return reply.send(sendSuccess(await getRoleDetail(Number(request.params.id))));
    }
  );

  app.patch(
    "/roles/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      const role = await updateRole(
        Number(request.params.id),
        request.body,
        actorId(request)
      );
      await recordOperationLog({
        operatorId: actorId(request),
        moduleCode: "ROLE",
        operationType: "UPDATE",
        requestMethod: request.method,
        requestPath: request.url,
        requestParams: { id: request.params.id, body: request.body },
      });
      return reply.send(sendSuccess(role));
    }
  );

  app.patch(
    "/roles/:id/status",
    async (
      request: FastifyRequest<{ Params: IdParams; Body: { status?: number } }>,
      reply: FastifyReply
    ) => {
      const role = await updateRoleStatus(
        Number(request.params.id),
        request.body?.status,
        actorId(request)
      );
      await recordOperationLog({
        operatorId: actorId(request),
        moduleCode: "ROLE",
        operationType: "STATUS",
        requestMethod: request.method,
        requestPath: request.url,
        requestParams: { id: request.params.id, body: request.body },
      });
      return reply.send(sendSuccess(role));
    }
  );

  app.delete(
    "/roles/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      await deleteRole(Number(request.params.id), actorId(request));
      await recordOperationLog({
        operatorId: actorId(request),
        moduleCode: "ROLE",
        operationType: "DELETE",
        requestMethod: request.method,
        requestPath: request.url,
        requestParams: { id: request.params.id },
      });
      return reply.send(sendSuccess({ message: "删除成功" }));
    }
  );

  app.get(
    "/roles/:id/users",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      return reply.send(
        sendSuccess(
          await listRoleUsers(
            Number(request.params.id),
            request.query as Record<string, unknown>
          )
        )
      );
    }
  );

  app.put(
    "/roles/:id/users",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      const users = await updateRoleUsers(
        Number(request.params.id),
        request.body,
        actorId(request)
      );
      await recordOperationLog({
        operatorId: actorId(request),
        moduleCode: "ROLE",
        operationType: "ASSIGN_USERS",
        requestMethod: request.method,
        requestPath: request.url,
        requestParams: { id: request.params.id, body: request.body },
      });
      return reply.send(sendSuccess(users));
    }
  );
}
