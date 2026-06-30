import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../utils/response";
import { listOperationLogs } from "../services/operation-logs";

export default async function logRoutes(app: FastifyInstance): Promise<void> {
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
}
