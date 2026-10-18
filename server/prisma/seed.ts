import bcrypt from "bcryptjs";
import { prisma } from "../src/db.js";

// Compte de démo pour le développement local uniquement
const DEMO_EMAIL = "demo@todolist.test";
const DEMO_PASSWORD = "demo1234";

async function main() {
  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });

  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      name: "Démo",
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
    },
  });

  const [perso, travail] = await Promise.all([
    prisma.project.create({ data: { name: "Perso", color: "#22c55e", position: 0, userId: user.id } }),
    prisma.project.create({ data: { name: "Travail", color: "#3b82f6", position: 1, userId: user.id } }),
  ]);

  const [urgent, maison] = await Promise.all([
    prisma.tag.create({ data: { name: "rapide", color: "#f59e0b", userId: user.id } }),
    prisma.tag.create({ data: { name: "maison", color: "#a855f7", userId: user.id } }),
  ]);

  const today = new Date();
  // Échéances « jour entier » : date calendaire stockée à minuit UTC
  const inDays = (n: number) => new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + n));

  await prisma.task.create({
    data: {
      title: "Préparer la réunion d'équipe",
      description: "Ordre du jour + slides",
      priority: "HIGH",
      dueDate: inDays(1),
      position: 0,
      userId: user.id,
      projectId: travail.id,
      subtasks: {
        create: [
          { title: "Lister les sujets", done: true, position: 0 },
          { title: "Faire les slides", position: 1 },
        ],
      },
    },
  });

  await prisma.task.create({
    data: {
      title: "Faire les courses",
      status: "IN_PROGRESS",
      dueDate: inDays(0),
      position: 0,
      userId: user.id,
      projectId: perso.id,
      tags: { create: [{ tagId: maison.id }, { tagId: urgent.id }] },
    },
  });

  await prisma.task.create({
    data: {
      title: "Payer le loyer",
      priority: "URGENT",
      dueDate: inDays(-1),
      recurrenceRule: "FREQ=MONTHLY;BYMONTHDAY=1",
      position: 1,
      userId: user.id,
      projectId: perso.id,
    },
  });

  await prisma.task.create({
    data: {
      title: "Lire un chapitre",
      status: "DONE",
      priority: "LOW",
      completedAt: today,
      position: 0,
      userId: user.id,
      projectId: perso.id,
    },
  });

  console.log(`Seed OK : ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
