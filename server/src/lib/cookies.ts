import type { CookieOptions, Response } from "express";
import { config } from "../config.js";

export const AUTH_COOKIE = "token";

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: config.isProduction,
  path: "/",
};

export function setAuthCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE, token, {
    ...cookieOptions,
    maxAge: config.jwtExpiresInDays * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE, cookieOptions);
}
