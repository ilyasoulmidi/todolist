import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { Prisma, Priority, TaskStatus } from "../generated/prisma/client.js";
import { HttpError } from "../lib/httpError.js";
import { assertOwnedTags, findOwnedProject, findOwnedTask } from "../lib/ownership.js";
import { isValidRule, nextOccurrence } from "../lib/recurrence.js";
import { booleanQuery, csvList, idParam, nullableDate } from "../lib/validation.js";
import { getUserId, requireAuth } from "../middleware/auth.js";

const status = z.enum(TaskStatus);
const priority = z.enum(Priority);

const taskFields = {
  title: z.string().trim().min(1, "Le titre est requis").max(200),
  description: z.string().max(5000).nullable(),
  status,
  priority,
  dueDate: nullableDate,
  allDay: z.boolean(),
  reminderAt: nullableDate,
  // Règle RRULE (RFC 5545) : voir lib/recurrence.ts pour le sous-ensemble pris en charge
  recurrenceRule: z
    .string()
    .trim()
    .max(200)
    .refine(isValidRule, "Règle de récurrence invalide")
    .nullable(),
  projectId: z.string().nullable(),
  tagIds: z.array(z.string()).max(20),
};

const createSchema = z
  .object({
    ...taskFields,
    subtasks: z.array(z.string().trim().min(1).max(200)).max(50),
  })
  .partial()
  .required({ title: true });

const updateSchema = z
  .object({
    ...taskFields,
    position: z.number(),
    archived: z.boolean(),
  })
  .partial();

const sortFields = ["position", "dueDate", "priority", "createdAt", "updatedAt", "title"] as const;

const listQuery = z.object({
  view: z.enum(["active", "archived", "trash"]).default("active"),
  status: csvList(status),
  priority: csvList(priority),
  // Id d'une liste, ou "none" pour les tâches sans liste
  projectId: z.string().optional(),
  tagId: csvList(z.string()),
  q: z.string().trim().max(200).optional(),
  // Intervalle d'échéance [dueFrom, dueTo[ calculé côté client selon son fuseau (Aujourd'hui, Semaine, En retard…)
  dueFrom: z.coerce.date().optional(),
  dueTo: z.coerce.date().optional(),
  noDue: booleanQuery.optional(),
  sort: z.enum(sortFields).default("position"),
  order: z.enum(["asc", "desc"]).default("asc"),
});

const subtaskCreateSchema = z.object({
  title: z.string().trim().min(1, "Le titre est requis").max(200),
  position: z.number().optional(),
});

const subtaskUpdateSchema = z
  .object({ title: subtaskCreateSchema.shape.title, done: z.boolean(), position: z.number() })
  .partial();

const subtaskParams = z.object({ id: z.string().min(1), subtaskId: z.string().min(1) });

const taskInclude = {
  subtasks: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
  tags: { include: { tag: true } },
  project: { select: { id: true, name: true, color: true } },
} satisfies Prisma.TaskInclude;

type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

function toDto({ tags, ...task }: TaskWithRelations) {
  return { ...task, tags: tags.map((t) => t.tag) };
}

async function nextPosition(userId: string, taskStatus: TaskStatus) {
  const { _max } = await prisma.task.aggregate({
    where: { userId, status: taskStatus, deletedAt: null },
    _max: { position: true },
  });
  return (_max.position ?? -1) + 1;
}

// Les tâches de la corbeille sont supprimées définitivement au bout de ce délai
export const TRASH_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/*
 * Quand une tâche récurrente est terminée, on crée l'occurrence suivante (une seule fois :
 * si on la rouvre puis la termine à nouveau, rien n'est dupliqué).
 * L'échéance suivante est calculée à partir de l'échéance actuelle (ou d'aujourd'hui sans échéance)
 * et ne peut pas tomber dans le passé.
 */
async function createNextOccurrence(task: TaskWithRelations) {
  if (!task.recurrenceRule) return null;
  const existing = await prisma.task.findFirst({ where: { recurrenceParentId: task.id } });
  if (existing) return null;

  const today = startOfTodayUtc();
  let next = nextOccurrence(task.recurrenceRule, task.dueDate ?? today);
  for (let i = 0; next && next < today && i < 1000; i++) next = nextOccurrence(task.recurrenceRule, next);
  if (!next) return null;

  // Le rappel garde le même écart avec l'échéance
  const reminderAt =
    task.reminderAt && task.dueDate
      ? new Date(task.reminderAt.getTime() + (next.getTime() - task.dueDate.getTime()))
      : null;

  const created = await prisma.task.create({
    data: {
      userId: task.userId,
      title: task.title,
      description: task.description,
      priority: task.priority,
      dueDate: next,
      allDay: task.allDay,
      reminderAt,
      recurrenceRule: task.recurrenceRule,
      recurrenceParentId: task.id,
      projectId: task.projectId,
      status: "TODO",
      position: await nextPosition(task.userId, "TODO"),
      tags: { create: task.tags.map(({ tag }) => ({ tagId: tag.id })) },
      subtasks: { create: task.subtasks.map(({ title, position }) => ({ title, position })) },
    },
    include: taskInclude,
  });
  return toDto(created);
}

async function loadTask(id: string) {
  return toDto(await prisma.task.findUniqueOrThrow({ where: { id }, include: taskInclude }));
}

async function findOwnedSubtask(userId: string, taskId: string, subtaskId: string) {
  await findOwnedTask(userId, taskId);
  const subtask = await prisma.subtask.findFirst({ where: { id: subtaskId, taskId } });
  if (!subtask) throw new HttpError(404, "Sous-tâche introuvable");
  return subtask;
}

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

tasksRouter.get("/", async (req, res) => {
  const userId = getUserId(req);
  const query = listQuery.parse(req.query);

  const where: Prisma.TaskWhereInput = { userId };

  if (query.view === "trash") {
    await prisma.task.deleteMany({
      where: { userId, deletedAt: { lt: new Date(Date.now() - TRASH_RETENTION_DAYS * DAY_MS) } },
    });
    where.deletedAt = { not: null };
  }
  else {
    where.deletedAt = null;
    where.archivedAt = query.view === "archived" ? { not: null } : null;
  }
  if (query.status) where.status = { in: query.status };
  if (query.priority) where.priority = { in: query.priority };
  if (query.projectId) where.projectId = query.projectId === "none" ? null : query.projectId;
  if (query.tagId) where.tags = { some: { tagId: { in: query.tagId } } };
  if (query.q) {
    where.OR = [
      { title: { contains: query.q, mode: "insensitive" } },
      { description: { contains: query.q, mode: "insensitive" } },
      { subtasks: { some: { title: { contains: query.q, mode: "insensitive" } } } },
    ];
  }
  if (query.noDue) where.dueDate = null;
  else if (query.dueFrom || query.dueTo) where.dueDate = { gte: query.dueFrom, lt: query.dueTo };

  const orderBy: Prisma.TaskOrderByWithRelationInput[] =
    query.sort === "dueDate"
      ? [{ dueDate: { sort: query.order, nulls: "last" } }]
      : [{ [query.sort]: query.order }];
  orderBy.push({ createdAt: "asc" });

  const tasks = await prisma.task.findMany({ where, orderBy, include: taskInclude });
  res.json({ tasks: tasks.map(toDto) });
});

// Vide la corbeille (suppression définitive)
tasksRouter.delete("/trash", async (req, res) => {
  const { count } = await prisma.task.deleteMany({
    where: { userId: getUserId(req), deletedAt: { not: null } },
  });
  res.json({ deleted: count });
});

// Rappels arrivés à échéance et pas encore notifiés
tasksRouter.get("/reminders/due", async (req, res) => {
  const tasks = await prisma.task.findMany({
    where: {
      userId: getUserId(req),
      reminderAt: { lte: new Date() },
      reminded: false,
      deletedAt: null,
      archivedAt: null,
      status: { not: "DONE" },
    },
    orderBy: { reminderAt: "asc" },
    include: taskInclude,
  });
  res.json({ tasks: tasks.map(toDto) });
});

// Archive d'un coup toutes les tâches terminées (éventuellement d'une seule liste)
tasksRouter.post("/archive-done", async (req, res) => {
  const userId = getUserId(req);
  const { projectId } = z.object({ projectId: z.string().nullable().optional() }).parse(req.body ?? {});
  const { count } = await prisma.task.updateMany({
    where: {
      userId,
      status: "DONE",
      deletedAt: null,
      archivedAt: null,
      ...(projectId !== undefined && { projectId }),
    },
    data: { archivedAt: new Date() },
  });
  res.json({ archived: count });
});

tasksRouter.get("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  await findOwnedTask(getUserId(req), id);
  res.json({ task: await loadTask(id) });
});

tasksRouter.post("/", async (req, res) => {
  const userId = getUserId(req);
  const { tagIds = [], subtasks = [], projectId, ...data } = createSchema.parse(req.body);

  if (projectId) await findOwnedProject(userId, projectId);
  await assertOwnedTags(userId, tagIds);

  const taskStatus = data.status ?? "TODO";
  const task = await prisma.task.create({
    data: {
      ...data,
      userId,
      projectId: projectId ?? null,
      status: taskStatus,
      position: await nextPosition(userId, taskStatus),
      completedAt: taskStatus === "DONE" ? new Date() : null,
      tags: { create: [...new Set(tagIds)].map((tagId) => ({ tagId })) },
      subtasks: { create: subtasks.map((title, position) => ({ title, position })) },
    },
    include: taskInclude,
  });
  res.status(201).json({ task: toDto(task) });
});

tasksRouter.patch("/:id", async (req, res) => {
  const userId = getUserId(req);
  const { id } = idParam.parse(req.params);
  const { tagIds, archived, projectId, ...data } = updateSchema.parse(req.body);
  const current = await findOwnedTask(userId, id);

  if (projectId) await findOwnedProject(userId, projectId);
  if (tagIds) await assertOwnedTags(userId, tagIds);

  const update: Prisma.TaskUncheckedUpdateInput = { ...data };

  if (projectId !== undefined) update.projectId = projectId;
  if (data.status !== undefined && data.status !== current.status) {
    update.completedAt = data.status === "DONE" ? new Date() : null;
    // Changement de colonne sans position précise : la tâche va en bas de la nouvelle colonne
    if (data.position === undefined) update.position = await nextPosition(userId, data.status);
  }
  if (archived !== undefined) update.archivedAt = archived ? (current.archivedAt ?? new Date()) : null;
  // Nouveau rappel : il devra être notifié à nouveau
  if (data.reminderAt !== undefined) update.reminded = false;
  if (tagIds) {
    update.tags = { deleteMany: {}, create: [...new Set(tagIds)].map((tagId) => ({ tagId })) };
  }

  await prisma.task.update({ where: { id }, data: update });
  const task = await prisma.task.findUniqueOrThrow({ where: { id }, include: taskInclude });

  const completed = data.status === "DONE" && current.status !== "DONE" && !task.deletedAt;
  const nextTask = completed ? await createNextOccurrence(task) : null;

  res.json({ task: toDto(task), nextTask });
});

tasksRouter.post("/:id/reminder/ack", async (req, res) => {
  const { id } = idParam.parse(req.params);
  await findOwnedTask(getUserId(req), id);
  await prisma.task.update({ where: { id }, data: { reminded: true } });
  res.status(204).end();
});

// Par défaut : mise à la corbeille (annulable). ?permanent=true : suppression définitive.
tasksRouter.delete("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { permanent = false } = z.object({ permanent: booleanQuery.optional() }).parse(req.query);
  await findOwnedTask(getUserId(req), id);

  if (permanent) await prisma.task.delete({ where: { id } });
  else await prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
  res.status(204).end();
});

tasksRouter.post("/:id/restore", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const task = await findOwnedTask(getUserId(req), id);
  if (!task.deletedAt) throw new HttpError(400, "La tâche n'est pas dans la corbeille");

  await prisma.task.update({ where: { id }, data: { deletedAt: null } });
  res.json({ task: await loadTask(id) });
});

tasksRouter.post("/:id/duplicate", async (req, res) => {
  const userId = getUserId(req);
  const { id } = idParam.parse(req.params);
  await findOwnedTask(userId, id);
  const source = await loadTask(id);

  const copy = await prisma.task.create({
    data: {
      userId,
      title: `${source.title} (copie)`.slice(0, 200),
      description: source.description,
      priority: source.priority,
      dueDate: source.dueDate,
      allDay: source.allDay,
      recurrenceRule: source.recurrenceRule,
      projectId: source.projectId,
      status: "TODO",
      position: await nextPosition(userId, "TODO"),
      tags: { create: source.tags.map((tag) => ({ tagId: tag.id })) },
      subtasks: { create: source.subtasks.map(({ title, position }) => ({ title, position })) },
    },
    include: taskInclude,
  });
  res.status(201).json({ task: toDto(copy) });
});

// --- Sous-tâches ---

tasksRouter.post("/:id/subtasks", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const data = subtaskCreateSchema.parse(req.body);
  await findOwnedTask(getUserId(req), id);

  const position =
    data.position ??
    ((await prisma.subtask.aggregate({ where: { taskId: id }, _max: { position: true } }))._max.position ?? -1) + 1;

  const subtask = await prisma.subtask.create({ data: { title: data.title, position, taskId: id } });
  res.status(201).json({ subtask });
});

tasksRouter.patch("/:id/subtasks/:subtaskId", async (req, res) => {
  const { id, subtaskId } = subtaskParams.parse(req.params);
  const data = subtaskUpdateSchema.parse(req.body);
  await findOwnedSubtask(getUserId(req), id, subtaskId);

  const subtask = await prisma.subtask.update({ where: { id: subtaskId }, data });
  res.json({ subtask });
});

tasksRouter.delete("/:id/subtasks/:subtaskId", async (req, res) => {
  const { id, subtaskId } = subtaskParams.parse(req.params);
  await findOwnedSubtask(getUserId(req), id, subtaskId);

  await prisma.subtask.delete({ where: { id: subtaskId } });
  res.status(204).end();
});
