import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { authRouter } from "./routes/auth.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors({ origin: config.clientUrl, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/api/health", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "ok" });
  });

  app.use("/api/auth", authRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
