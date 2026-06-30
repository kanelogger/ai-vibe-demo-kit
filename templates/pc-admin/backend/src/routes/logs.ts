import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../utils/response";
import {
  getExceptionLog,
  getLoginLog,
  getOperationLog,
  listExceptionLogs,
  listLoginLogs,
  listOperationLogs,
} from "../services/log-management";

interface IdParams {
  id: string;
}

export default async function logRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/logs/login",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(
        sendSuccess(await listLoginLogs(request.query as Record<string, unknown>))
      );
    }
  );

  app.get(
    "/logs/operation",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(
        sendSuccess(
          await listOperationLogs(request.query as Record<string, unknown>)
        )
      );
    }
  );

  app.get(
    "/logs/exception",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(
        sendSuccess(
          await listExceptionLogs(request.query as Record<string, unknown>)
        )
      );
    }
  );

  app.get(
    "/logs/login/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      return reply.send(sendSuccess(await getLoginLog(Number(request.params.id))));
    }
  );

  app.get(
    "/logs/operation/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      return reply.send(
        sendSuccess(await getOperationLog(Number(request.params.id)))
      );
    }
  );

  app.get(
    "/logs/exception/:id",
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply
    ) => {
      return reply.send(
        sendSuccess(await getExceptionLog(Number(request.params.id)))
      );
    }
  );
}
