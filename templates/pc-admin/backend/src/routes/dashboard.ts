import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../utils/errors";
import { sendSuccess } from "../utils/response";
import { getDashboardOverview } from "../services/dashboard";

function currentUserId(request: FastifyRequest): number {
  const userId = request.user?.userId;
  if (!userId) throw new AppError("UNAUTHORIZED", "未登录");
  return userId;
}

export default async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/dashboard/overview",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(sendSuccess(await getDashboardOverview(currentUserId(request))));
    }
  );
}
