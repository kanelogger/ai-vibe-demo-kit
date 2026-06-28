import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";
import * as jwt from "jsonwebtoken";
import config from "../config";

export interface JwtPayload {
  accountId: string | number;
}

export const WHITELIST = ["/login", "/register", "/refresh-token", "/captcha", "/get-async-routes"];

export function signToken(payload: object, expiresIn: string | number = "1h"): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret) as JwtPayload;
}

export function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  if (WHITELIST.includes(request.url.split("?")[0])) {
    return done();
  }

  const authHeader = request.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    reply.code(401).send({ success: false, data: { message: "未授权" } });
    return;
  }

  const token = authHeader.slice("Bearer ".length);
  try {
    request.user = verifyToken(token);
    done();
  } catch (error) {
    reply.code(401).send({ success: false, data: { message: "token 无效" } });
  }
}

declare module "fastify" {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}
