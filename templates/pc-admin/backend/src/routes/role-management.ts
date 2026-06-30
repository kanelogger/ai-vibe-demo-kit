import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../utils/response";
import {
  createRole,
  deleteRole,
  getRoleDetail,
  listMenuTree,
  listRoles,
  listRoleUsers,
  updateRole,
  updateRoleStatus,
  updateRoleUsers,
} from "../services/role-management";

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
      return reply.send(sendSuccess(users));
    }
  );

  app.get("/menus/tree", async (_request, reply) => {
    return reply.send(sendSuccess(await listMenuTree()));
  });
}
