import { config } from "dotenv";
import { afterAll, beforeEach } from "vitest";

config({ path: ".env.test", override: true, quiet: true });

const { prisma } = await import("../src/db.js");

beforeEach(async () => {
  // Repart d'une base vide (les cascades suppriment tâches, listes, tags…)
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
