import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  searchUsers,
  searchUsersByUsername,
  updateUser,
  deleteUser,
} from "../services/users";
import { Message } from "../utils/enums";

interface SearchPageBody {
  page: number;
  size: number;
}

interface SearchVagueBody {
  username: string;
}

interface UpdateListBody {
  username: string;
}

interface UpdateListParams {
  id: string;
}

interface DeleteListParams {
  id: string;
}

export default async function userRoutes(app: FastifyInstance): Promise<void> {
  app.post("/searchPage", async (
    request: FastifyRequest<{ Body: SearchPageBody }>,
    reply: FastifyReply
  ) => {
    const { page = 1, size = 10 } = request.body;
    const data = await searchUsers(Number(page), Number(size));
    return reply.send({ success: true, data });
  });

  app.post("/searchVague", async (
    request: FastifyRequest<{ Body: SearchVagueBody }>,
    reply: FastifyReply
  ) => {
    const { username } = request.body;
    if (!username || username === "") {
      return reply.send({ success: false, data: { message: Message[9] } });
    }
    const data = await searchUsersByUsername(username);
    return reply.send({ success: true, data });
  });

  app.put("/updateList/:id", async (
    request: FastifyRequest<{ Params: UpdateListParams; Body: UpdateListBody }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;
    const { username } = request.body;
    await updateUser(Number(id), username);
    return reply.send({ success: true, data: { message: Message[7] } });
  });

  app.delete("/deleteList/:id", async (
    request: FastifyRequest<{ Params: DeleteListParams }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;
    await deleteUser(Number(id));
    return reply.send({ success: true, data: { message: Message[8] } });
  });
}
