import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { authRouter } from "./routes/auth.js";
import { dataRouter } from "./routes/data.js";
import { pomodorosRouter } from "./routes/pomodoros.js";
import { projectsRouter } from "./routes/projects.js";
import { statsRouter } from "./routes/stats.js";
import { tagsRouter } from "./routes/tags.js";
import { tasksRouter } from "./routes/tasks.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors({ origin: config.clientUrl, credentials: true }));
  // L'import accepte des fichiers plus gros que les autres requêtes
  app.use("/api/data/import", express.json({ limit: "10mb" }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/api/health", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/tags", tagsRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/pomodoros", pomodorosRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/data", dataRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
