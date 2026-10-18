import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface TokenPayload {
  sub: string; // id de l'utilisateur
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies TokenPayload, config.jwtSecret, {
    expiresIn: `${config.jwtExpiresInDays}d`,
  });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (typeof payload === "string" || typeof payload.sub !== "string") return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}
