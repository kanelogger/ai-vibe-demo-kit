import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export default async function asyncRoutes(app: FastifyInstance): Promise<void> {
  app.get("/get-async-routes", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ success: true, data: [] });
  });
}
