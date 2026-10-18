import { prisma } from "../db.js";
import { HttpError } from "./httpError.js";

// Chaque helper renvoie 404 (et non 403) pour ne pas révéler l'existence des ressources d'autrui

export async function findOwnedTask(userId: string, id: string) {
  const task = await prisma.task.findFirst({ where: { id, userId } });
  if (!task) throw new HttpError(404, "Tâche introuvable");
  return task;
}

export async function findOwnedProject(userId: string, id: string) {
  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) throw new HttpError(404, "Liste introuvable");
  return project;
}

export async function findOwnedTag(userId: string, id: string) {
  const tag = await prisma.tag.findFirst({ where: { id, userId } });
  if (!tag) throw new HttpError(404, "Étiquette introuvable");
  return tag;
}

export async function assertOwnedTags(userId: string, tagIds: string[]) {
  if (tagIds.length === 0) return;
  const unique = [...new Set(tagIds)];
  const count = await prisma.tag.count({ where: { userId, id: { in: unique } } });
  if (count !== unique.length) throw new HttpError(400, "Étiquette inconnue");
}
