import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createMathExpr } from "svg-captcha";
import { findUserByUsername, createUser } from "../services/users";
import { verifyPassword } from "../utils/password";
import { signToken } from "../utils/jwt";
import { Message } from "../utils/enums";

interface LoginBody {
  username: string;
  password: string;
}

interface RegisterBody {
  username: string;
  password: string;
}

interface RefreshBody {
  refreshToken?: string;
}

let generateVerify = 0;
const accessExpiresIn = 60000; // 1 分钟，方便演示

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/login", async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
    const { username, password } = request.body;
    const user = await findUserByUsername(username);

    if (!user) {
      return reply.send({ success: false, data: { message: Message[1] } });
    }

    if (!verifyPassword(password, user.password)) {
      return reply.send({ success: false, data: { message: Message[3] } });
    }

    const accessToken = signToken({ accountId: user.id }, accessExpiresIn);
    const roles = username === "admin" ? ["admin"] : ["common"];

    return reply.send({
      success: true,
      data: {
        message: Message[2],
        username,
        roles,
        accessToken,
        refreshToken: "eyJhbGciOiJIUzUxMiJ9.adminRefresh",
        expires: Date.now() + accessExpiresIn,
        adminBackend: "这个标识是admin-backend真实后端返回的接口，只是为了演示",
      },
    });
  });

  app.post("/register", async (request: FastifyRequest<{ Body: RegisterBody }>, reply: FastifyReply) => {
    const { username, password } = request.body;

    if (password.length < 6) {
      return reply.send({ success: false, data: { message: Message[4] } });
    }

    const existing = await findUserByUsername(username);
    if (existing) {
      return reply.send({ success: false, data: { message: Message[5] } });
    }

    await createUser(username, password);
    return reply.send({ success: true, data: { message: Message[6] } });
  });

  app.post("/refresh-token", async (request: FastifyRequest<{ Body: RefreshBody }>, reply: FastifyReply) => {
    const { refreshToken } = request.body || {};
    const accessToken = signToken({ accountId: "admin" }, "1h");

    return reply.send({
      success: true,
      data: {
        accessToken,
        refreshToken: refreshToken || "eyJhbGciOiJIUzUxMiJ9.adminRefresh",
        expires: Date.now() + 60 * 60 * 1000,
      },
    });
  });

  app.get("/captcha", async (_request: FastifyRequest, reply: FastifyReply) => {
    const create = createMathExpr({
      mathMin: 1,
      mathMax: 4,
      mathOperator: "+",
    });
    generateVerify = Number(create.text);

    return reply
      .header("Content-Type", "application/json; charset=utf-8")
      .send({ success: true, data: { text: create.text, svg: create.data } });
  });
}
