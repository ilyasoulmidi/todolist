import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { findOwnedProject } from "../lib/ownership.js";
import { booleanQuery, hexColor, idParam } from "../lib/validation.js";
import { getUserId, requireAuth } from "../middleware/auth.js";

const createSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis").max(50),
  color: hexColor.optional(),
  icon: z.string().max(10).nullable().optional(),
  position: z.number().optional(),
});

const updateSchema = createSchema.partial().extend({
  archived: z.boolean().optional(),
});

const listQuery = z.object({ archived: booleanQuery.optional() });

// Nombre de tâches encore ouvertes, affiché dans la barre latérale
const openTasksCount = {
  _count: {
    select: { tasks: { where: { deletedAt: null, archivedAt: null, status: { not: "DONE" as const } } } },
  },
};

function toDto<T extends { _count: { tasks: number } }>({ _count, ...project }: T) {
  return { ...project, openTaskCount: _count.tasks };
}

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

projectsRouter.get("/", async (req, res) => {
  const { archived = false } = listQuery.parse(req.query);
  const projects = await prisma.project.findMany({
    where: { userId: getUserId(req), archivedAt: archived ? { not: null } : null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: openTasksCount,
  });
  res.json({ projects: projects.map(toDto) });
});

projectsRouter.post("/", async (req, res) => {
  const userId = getUserId(req);
  const data = createSchema.parse(req.body);

  // Par défaut, la nouvelle liste se place à la fin
  const position =
    data.position ??
    ((await prisma.project.aggregate({ where: { userId }, _max: { position: true } }))._max.position ?? -1) + 1;

  const project = await prisma.project.create({
    data: { ...data, position, userId },
    include: openTasksCount,
  });
  res.status(201).json({ project: toDto(project) });
});

projectsRouter.patch("/:id", async (req, res) => {
  const userId = getUserId(req);
  const { id } = idParam.parse(req.params);
  const { archived, ...data } = updateSchema.parse(req.body);
  const current = await findOwnedProject(userId, id);

  const project = await prisma.project.update({
    where: { id },
    data: {
      ...data,
      ...(archived !== undefined && {
        archivedAt: archived ? (current.archivedAt ?? new Date()) : null,
      }),
    },
    include: openTasksCount,
  });
  res.json({ project: toDto(project) });
});

// Supprime la liste ; ses tâches sont conservées et passent « sans liste »
projectsRouter.delete("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  await findOwnedProject(getUserId(req), id);
  await prisma.project.delete({ where: { id } });
  res.status(204).end();
});
