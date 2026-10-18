import { Router } from "express";
import { prisma } from "../db.js";
import { getUserId, requireAuth } from "../middleware/auth.js";

const YEAR_MS = 366 * 24 * 60 * 60 * 1000;

export const statsRouter = Router();
statsRouter.use(requireAuth);

/*
 * Données brutes de l'année écoulée : le client les regroupe par jour dans SON fuseau horaire
 * (un regroupement côté serveur se tromperait de jour autour de minuit).
 */
statsRouter.get("/", async (req, res) => {
  const userId = getUserId(req);
  const since = new Date(Date.now() - YEAR_MS);
  const active = { userId, deletedAt: null };

  const [completed, created, openTasks, pomodoros, doneCount, totalCount] = await Promise.all([
    prisma.task.findMany({
      where: { ...active, status: "DONE", completedAt: { gte: since } },
      select: { completedAt: true },
    }),
    prisma.task.findMany({ where: { ...active, createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.task.findMany({
      where: { ...active, archivedAt: null, status: { not: "DONE" } },
      select: { status: true, priority: true, dueDate: true, project: { select: { id: true, name: true, color: true } } },
    }),
    prisma.pomodoroSession.findMany({
      where: { userId, startedAt: { gte: since }, endedAt: { not: null } },
      select: { startedAt: true, durationMin: true, type: true, completed: true },
    }),
    prisma.task.count({ where: { ...active, status: "DONE" } }),
    prisma.task.count({ where: active }),
  ]);

  res.json({
    completedAt: completed.map((t) => t.completedAt),
    createdAt: created.map((t) => t.createdAt),
    open: openTasks,
    pomodoros,
    totals: { done: doneCount, all: totalCount },
  });
});
