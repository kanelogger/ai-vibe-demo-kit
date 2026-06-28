import Fastify from "fastify";
import cors from "@fastify/cors";
import { requireAuth } from "./utils/jwt";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import asyncRoutes from "./routes/async-routes";

export function buildApp() {
  const app = Fastify({
    logger: false,
  });

  app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  app.addHook("onRequest", requireAuth);

  app.register(authRoutes);
  app.register(userRoutes);
  app.register(asyncRoutes);

  return app;
}
