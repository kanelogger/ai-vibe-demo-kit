import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../utils/response";
import {
  createMenu,
  deleteMenu,
  getMenuDetail,
  listMenuTree,
  sortMenuTree,
  updateMenu,
  updateMenuRoles,
  updateMenuStatus,
} from "../services/menu-management";
import { recordOperationLog } from "../services/operation-logs";

interface IdParams {
  id: string;
}

function actorId(request: FastifyRequest): number | null {
  return request.user?.userId ?? null;
}

export default async function menuManagementRoutes(
  app: FastifyInstance
): Promise<void> {
  app.get("/menus/tree", async (_request, reply) => {
    return reply.send(sendSuccess(await listMenuTree()));
  });

  app.post("/menus", async (request: FastifyRequest, reply: FastifyReply) => {
    const menu = await createMenu(request.body, actorId(request));
    await recordOperationLog({
      operatorId: actorId(request),
      moduleCode: "MENU",
      operationType: "CREATE",
      requestMethod: request.method,
      requestPath: request.url,
      requestParams: request.body,
    });
    return reply.send(sendSuccess(menu));
  });

  app.get(
    "/menus/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      return reply.send(sendSuccess(await getMenuDetail(Number(request.params.id))));
    }
  );

  app.patch(
    "/menus/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      const menu = await updateMenu(
        Number(request.params.id),
        request.body,
        actorId(request)
      );
      await recordOperationLog({
        operatorId: actorId(request),
        moduleCode: "MENU",
        operationType: "UPDATE",
        requestMethod: request.method,
        requestPath: request.url,
        requestParams: { id: request.params.id, body: request.body },
      });
      return reply.send(sendSuccess(menu));
    }
  );

  app.patch(
    "/menus/:id/status",
    async (
      request: FastifyRequest<{ Params: IdParams; Body: { status?: number } }>,
      reply: FastifyReply
    ) => {
      const menu = await updateMenuStatus(
        Number(request.params.id),
        request.body?.status,
        actorId(request)
      );
      await recordOperationLog({
        operatorId: actorId(request),
        moduleCode: "MENU",
        operationType: "STATUS",
        requestMethod: request.method,
        requestPath: request.url,
        requestParams: { id: request.params.id, body: request.body },
      });
      return reply.send(sendSuccess(menu));
    }
  );

  app.patch("/menus/tree/sort", async (request, reply) => {
    const result = await sortMenuTree(request.body, actorId(request));
    await recordOperationLog({
      operatorId: actorId(request),
      moduleCode: "MENU",
      operationType: "SORT",
      requestMethod: request.method,
      requestPath: request.url,
      requestParams: request.body,
    });
    return reply.send(sendSuccess(result));
  });

  app.put(
    "/menus/:id/roles",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      const menu = await updateMenuRoles(
        Number(request.params.id),
        request.body,
        actorId(request)
      );
      await recordOperationLog({
        operatorId: actorId(request),
        moduleCode: "MENU",
        operationType: "ASSIGN_ROLES",
        requestMethod: request.method,
        requestPath: request.url,
        requestParams: { id: request.params.id, body: request.body },
      });
      return reply.send(sendSuccess(menu));
    }
  );

  app.delete(
    "/menus/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      await deleteMenu(Number(request.params.id), actorId(request));
      await recordOperationLog({
        operatorId: actorId(request),
        moduleCode: "MENU",
        operationType: "DELETE",
        requestMethod: request.method,
        requestPath: request.url,
        requestParams: { id: request.params.id },
      });
      return reply.send(sendSuccess({ message: "删除成功" }));
    }
  );
}
