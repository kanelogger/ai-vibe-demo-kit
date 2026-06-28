import { createHash } from "crypto";

export function hashPassword(password: string): string {
  return createHash("md5").update(password).digest("hex");
}

export function verifyPassword(password: string, hashed: string): boolean {
  return hashPassword(password) === hashed;
}
