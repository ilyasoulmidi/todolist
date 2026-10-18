import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { Priority, TaskStatus } from "../generated/prisma/client.js";
import { parseCsv, toCsv } from "../lib/csv.js";
import { HttpError } from "../lib/httpError.js";
import { isValidRule } from "../lib/recurrence.js";
import { getUserId, requireAuth } from "../middleware/auth.js";

export const EXPORT_VERSION = 1;
const MAX_IMPORT_TASKS = 5000;

const statusLabels: Record<TaskStatus, string> = { TODO: "À faire", IN_PROGRESS: "En cours", DONE: "Fait" };
const priorityLabels: Record<Priority, string> = { LOW: "Basse", MEDIUM: "Moyenne", HIGH: "Haute", URGENT: "Urgente" };

const CSV_HEADER = [
  "titre",
  "description",
  "statut",
  "priorite",
  "echeance",
  "liste",
  "etiquettes",
  "sous_taches",
  "recurrence",
  "creee_le",
  "terminee_le",
];

// « À faire », « a faire », « TODO »… → TODO (insensible à la casse et aux accents)
function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

function lookup<T extends string>(labels: Record<T, string>, value: string | undefined): T | undefined {
  if (!value?.trim()) return undefined;
  const v = normalize(value);
  return (Object.keys(labels) as T[]).find((key) => normalize(key) === v || normalize(labels[key]) === v);
}

// --- Format d'échange commun (JSON) ---

const importTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullish(),
  status: z.string().nullish(),
  priority: z.string().nullish(),
  dueDate: z.coerce.date().nullish(),
  reminderAt: z.coerce.date().nullish(),
  recurrenceRule: z.string().max(200).nullish(),
  project: z.string().trim().max(50).nullish(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  subtasks: z
    .array(z.object({ title: z.string().trim().min(1).max(200), done: z.boolean().default(false) }))
    .max(50)
    .default([]),
  completedAt: z.coerce.date().nullish(),
  archived: z.boolean().default(false),
});

const importSchema = z.object({
  projects: z.array(z.object({ name: z.string().trim().min(1).max(50), color: z.string().nullish() })).default([]),
  tags: z.array(z.object({ name: z.string().trim().min(1).max(30), color: z.string().nullish() })).default([]),
  tasks: z.array(importTaskSchema).max(MAX_IMPORT_TASKS, `${MAX_IMPORT_TASKS} tâches maximum par import`),
});

type ImportData = z.infer<typeof importSchema>;

const HEX = /^#[0-9a-fA-F]{6}$/;
const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

function csvToImport(text: string): ImportData {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new HttpError(400, "Le fichier CSV est vide");
  const columns = header.map(normalize);
  const col = (name: string) => columns.indexOf(normalize(name));
  if (col("titre") === -1 && col("title") === -1) throw new HttpError(400, "Colonne « titre » introuvable dans le CSV");

  const get = (row: string[], ...names: string[]) => {
    for (const n of names) {
      const i = col(n);
      if (i !== -1 && row[i]?.trim()) return row[i].trim();
    }
    return undefined;
  };

  return importSchema.parse({
    tasks: rows.map((row) => ({
      title: get(row, "titre", "title") ?? "",
      description: get(row, "description"),
      status: get(row, "statut", "status"),
      priority: get(row, "priorite", "priority"),
      dueDate: get(row, "echeance", "due date", "dueDate"),
      recurrenceRule: get(row, "recurrence"),
      project: get(row, "liste", "project"),
      tags: (get(row, "etiquettes", "tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
      subtasks: (get(row, "sous_taches", "subtasks") ?? "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => ({ title: s.replace(/^\[[ xX]\]\s*/, ""), done: /^\[[xX]\]/.test(s) })),
      completedAt: get(row, "terminee_le", "completed"),
    })),
  });
}

export const dataRouter = Router();
dataRouter.use(requireAuth);

dataRouter.get("/export", async (req, res) => {
  const userId = getUserId(req);
  const { format } = z.object({ format: z.enum(["json", "csv"]).default("json") }).parse(req.query);

  const [projects, tags, tasks] = await Promise.all([
    prisma.project.findMany({ where: { userId }, orderBy: { position: "asc" } }),
    prisma.tag.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    prisma.task.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ status: "asc" }, { position: "asc" }],
      include: {
        project: true,
        tags: { include: { tag: true } },
        subtasks: { orderBy: { position: "asc" } },
      },
    }),
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Disposition", `attachment; filename="todolist-${stamp}.${format}"`);

  if (format === "csv") {
    res.type("text/csv; charset=utf-8");
    res.send(
      toCsv(
        CSV_HEADER,
        tasks.map((t) => [
          t.title,
          t.description ?? "",
          statusLabels[t.status],
          priorityLabels[t.priority],
          dateOnly(t.dueDate),
          t.project?.name ?? "",
          t.tags.map(({ tag }) => tag.name).join(", "),
          t.subtasks.map((s) => `[${s.done ? "x" : " "}] ${s.title}`).join(" | "),
          t.recurrenceRule ?? "",
          t.createdAt.toISOString(),
          t.completedAt?.toISOString() ?? "",
        ]),
      ),
    );
    return;
  }

  res.json({
    app: "todolist",
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    projects: projects.map((p) => ({ name: p.name, color: p.color })),
    tags: tags.map((t) => ({ name: t.name, color: t.color })),
    tasks: tasks.map((t) => ({
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      reminderAt: t.reminderAt,
      recurrenceRule: t.recurrenceRule,
      project: t.project?.name ?? null,
      tags: t.tags.map(({ tag }) => tag.name),
      subtasks: t.subtasks.map((s) => ({ title: s.title, done: s.done })),
      completedAt: t.completedAt,
      archived: !!t.archivedAt,
    })),
  });
});

const importBody = z.discriminatedUnion("format", [
  z.object({ format: z.literal("json"), data: z.unknown() }),
  z.object({ format: z.literal("csv"), content: z.string().max(10_000_000) }),
]);

// Ajoute les tâches importées à l'existant ; listes et étiquettes sont réutilisées si le nom existe déjà
dataRouter.post("/import", async (req, res) => {
  const userId = getUserId(req);
  const body = importBody.parse(req.body);
  const data = body.format === "csv" ? csvToImport(body.content) : importSchema.parse(body.data);

  const result = await prisma.$transaction(
    async (tx) => {
      const counts = { tasks: 0, projects: 0, tags: 0 };

      // --- Listes ---
      const existingProjects = await tx.project.findMany({ where: { userId } });
      const projectIds = new Map(existingProjects.map((p) => [p.name.toLowerCase(), p.id]));
      let position = Math.max(-1, ...existingProjects.map((p) => p.position)) + 1;
      const wantedProjects = new Map<string, string | null | undefined>();
      for (const p of data.projects) wantedProjects.set(p.name, p.color);
      for (const t of data.tasks) if (t.project && !wantedProjects.has(t.project)) wantedProjects.set(t.project, null);
      for (const [name, color] of wantedProjects) {
        if (projectIds.has(name.toLowerCase())) continue;
        const created = await tx.project.create({
          data: { userId, name, position: position++, ...(color && HEX.test(color) && { color }) },
        });
        projectIds.set(name.toLowerCase(), created.id);
        counts.projects++;
      }

      // --- Étiquettes ---
      const existingTags = await tx.tag.findMany({ where: { userId } });
      const tagIds = new Map(existingTags.map((t) => [t.name.toLowerCase(), t.id]));
      const wantedTags = new Map<string, string | null | undefined>();
      for (const t of data.tags) wantedTags.set(t.name, t.color);
      for (const task of data.tasks) for (const name of task.tags) if (!wantedTags.has(name)) wantedTags.set(name, null);
      for (const [name, color] of wantedTags) {
        if (tagIds.has(name.toLowerCase())) continue;
        const created = await tx.tag.create({ data: { userId, name, ...(color && HEX.test(color) && { color }) } });
        tagIds.set(name.toLowerCase(), created.id);
        counts.tags++;
      }

      // --- Tâches (ajoutées en bas de chaque colonne) ---
      const maxPositions = await tx.task.groupBy({
        by: ["status"],
        where: { userId, deletedAt: null },
        _max: { position: true },
      });
      const nextPos = new Map<TaskStatus, number>(
        maxPositions.map((m) => [m.status, (m._max.position ?? -1) + 1]),
      );

      for (const t of data.tasks) {
        const status = lookup(statusLabels, t.status ?? undefined) ?? "TODO";
        const priority = lookup(priorityLabels, t.priority ?? undefined) ?? "MEDIUM";
        const pos = nextPos.get(status) ?? 0;
        nextPos.set(status, pos + 1);
        await tx.task.create({
          data: {
            userId,
            title: t.title,
            description: t.description || null,
            status,
            priority,
            position: pos,
            dueDate: t.dueDate ?? null,
            reminderAt: t.reminderAt ?? null,
            recurrenceRule: t.recurrenceRule && isValidRule(t.recurrenceRule) ? t.recurrenceRule : null,
            projectId: t.project ? projectIds.get(t.project.toLowerCase()) : null,
            completedAt: status === "DONE" ? (t.completedAt ?? new Date()) : null,
            archivedAt: t.archived ? new Date() : null,
            tags: { create: [...new Set(t.tags.map((n) => tagIds.get(n.toLowerCase())!))].map((tagId) => ({ tagId })) },
            subtasks: { create: t.subtasks.map((s, i) => ({ title: s.title, done: s.done, position: i })) },
          },
        });
        counts.tasks++;
      }
      return counts;
    },
    { timeout: 60_000 },
  );

  res.status(201).json({ imported: result });
});
