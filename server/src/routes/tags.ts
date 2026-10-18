import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { findOwnedTag } from "../lib/ownership.js";
import { hexColor, idParam } from "../lib/validation.js";
import { getUserId, requireAuth } from "../middleware/auth.js";

const createSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis").max(30),
  color: hexColor.optional(),
});

const updateSchema = createSchema.partial();

export const tagsRouter = Router();
tagsRouter.use(requireAuth);

tagsRouter.get("/", async (req, res) => {
  const tags = await prisma.tag.findMany({
    where: { userId: getUserId(req) },
    orderBy: { name: "asc" },
  });
  res.json({ tags });
});

tagsRouter.post("/", async (req, res) => {
  const data = createSchema.parse(req.body);
  const tag = await prisma.tag.create({ data: { ...data, userId: getUserId(req) } });
  res.status(201).json({ tag });
});

tagsRouter.patch("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const data = updateSchema.parse(req.body);
  await findOwnedTag(getUserId(req), id);
  const tag = await prisma.tag.update({ where: { id }, data });
  res.json({ tag });
});

tagsRouter.delete("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  await findOwnedTag(getUserId(req), id);
  await prisma.tag.delete({ where: { id } });
  res.status(204).end();
});
