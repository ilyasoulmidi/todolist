import type { NextFunction, Request, Response } from "express";
import { AUTH_COOKIE } from "../lib/cookies.js";
import { HttpError } from "../lib/httpError.js";
import { verifyToken } from "../lib/jwt.js";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token: string | undefined = req.cookies?.[AUTH_COOKIE];
  const payload = token ? verifyToken(token) : null;
  if (!payload) throw new HttpError(401, "Non authentifié");
  req.userId = payload.sub;
  next();
}

// À utiliser dans les routes protégées par requireAuth
export function getUserId(req: Request): string {
  if (!req.userId) throw new HttpError(401, "Non authentifié");
  return req.userId;
}
