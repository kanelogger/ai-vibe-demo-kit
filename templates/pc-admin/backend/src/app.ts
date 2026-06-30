import Fastify, { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { AppError, isAppError } from "./utils/errors";
import { requireAuth } from "./utils/jwt";
import { sendError } from "./utils/response";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import userManagementRoutes from "./routes/user-management";
import roleManagementRoutes from "./routes/role-management";
import menuManagementRoutes from "./routes/menu-management";
import logRoutes from "./routes/logs";
import orgManagementRoutes from "./routes/org-management";
import dictManagementRoutes from "./routes/dict-management";
import asyncRoutes from "./routes/async-routes";
import Logger from "./loaders/logger";

export function buildApp() {
  const app = Fastify({
    logger: false,
  });

  app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });

  app.addHook("onRequest", requireAuth);

  app.register(authRoutes);
  app.register(userManagementRoutes);
  app.register(roleManagementRoutes);
  app.register(menuManagementRoutes);
  app.register(logRoutes);
  app.register(orgManagementRoutes);
  app.register(dictManagementRoutes);
  app.register(userRoutes);
  app.register(asyncRoutes);

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply
      .code(404)
      .send(sendError("NOT_FOUND", `路由 ${request.url} 不存在`));
  });

  app.setErrorHandler(
    (error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
      if (isAppError(error)) {
        reply
          .code(error.statusCode)
          .send(sendError(error.code, error.message, error.details));
        return;
      }

      if (error.validation) {
        reply
          .code(422)
          .send(
            sendError("VALIDATION_ERROR", error.message || "请求参数校验失败", {
              errors: error.validation,
            })
          );
        return;
      }

      Logger.error("Unhandled error: %o", error);
      reply.code(500).send(sendError("INTERNAL_ERROR", "服务器内部错误"));
    }
  );

  return app;
}

export { AppError, sendError };
