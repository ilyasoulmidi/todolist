import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
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

// Front compilé (client/dist), servi par l'API en production : une seule adresse pour tout
const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  // Derrière le proxy de l'hébergeur : vraie IP (limitation des tentatives) et cookies sécurisés
  if (config.isProduction) app.set("trust proxy", 1);
  // En-têtes de sécurité ; la CSP est désactivée car les toasts injectent leurs styles
  app.use(helmet({ contentSecurityPolicy: false }));
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

  if (config.isProduction && existsSync(CLIENT_DIST)) {
    // Les fichiers de assets/ ont un nom qui change à chaque build : cache long sans risque
    app.use("/assets", express.static(path.join(CLIENT_DIST, "assets"), { maxAge: "1y", immutable: true }));
    app.use(express.static(CLIENT_DIST, { index: false }));
    // Routes du front (/kanban, /liste…) : on renvoie l'application React
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) return next();
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(CLIENT_DIST, "index.html"));
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
