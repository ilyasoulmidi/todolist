import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { PomodoroType } from "../generated/prisma/client.js";
import { HttpError } from "../lib/httpError.js";
import { findOwnedTask } from "../lib/ownership.js";
import { idParam } from "../lib/validation.js";
import { getUserId, requireAuth } from "../middleware/auth.js";

const startSchema = z.object({
  type: z.enum(PomodoroType).default("WORK"),
  durationMin: z.number().int().min(1).max(180),
  taskId: z.string().nullable().optional(),
});

const finishSchema = z.object({ completed: z.boolean() });

const listQuery = z.object({ taskId: z.string().optional() });

export const pomodorosRouter = Router();
pomodorosRouter.use(requireAuth);

// Sessions d'une tâche (pour afficher le temps de concentration passé dessus)
pomodorosRouter.get("/", async (req, res) => {
  const userId = getUserId(req);
  const { taskId } = listQuery.parse(req.query);
  const sessions = await prisma.pomodoroSession.findMany({
    where: { userId, ...(taskId && { taskId }) },
    orderBy: { startedAt: "desc" },
    take: 200,
  });
  res.json({ sessions });
});

pomodorosRouter.post("/", async (req, res) => {
  const userId = getUserId(req);
  const { taskId, ...data } = startSchema.parse(req.body);
  if (taskId) await findOwnedTask(userId, taskId);

  const session = await prisma.pomodoroSession.create({
    data: { ...data, userId, taskId: taskId ?? null },
  });
  res.status(201).json({ session });
});

// Fin de session : terminée normalement (completed) ou interrompue
pomodorosRouter.patch("/:id", async (req, res) => {
  const userId = getUserId(req);
  const { id } = idParam.parse(req.params);
  const { completed } = finishSchema.parse(req.body);

  const current = await prisma.pomodoroSession.findFirst({ where: { id, userId } });
  if (!current) throw new HttpError(404, "Session introuvable");
  if (current.endedAt) throw new HttpError(400, "Session déjà terminée");

  const endedAt = new Date();
  // Une session interrompue ne compte que pour le temps réellement passé
  const elapsedMin = Math.max(0, Math.round((endedAt.getTime() - current.startedAt.getTime()) / 60000));
  const session = await prisma.pomodoroSession.update({
    where: { id },
    data: {
      endedAt,
      completed,
      durationMin: completed ? current.durationMin : Math.min(current.durationMin, elapsedMin),
    },
  });
  res.json({ session });
});
