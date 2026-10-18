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

  // Historique pour la page Statistiques : tâches terminées (puis archivées) sur ~4 mois
  // Pseudo-aléatoire déterministe pour que la démo soit identique à chaque seed
  let seedValue = 42;
  const random = () => ((seedValue = (seedValue * 16807) % 2147483647) / 2147483647);
  const history = [
    "Répondre aux emails",
    "Faire le point hebdo",
    "Ranger le bureau",
    "Courir 5 km",
    "Lire 20 pages",
    "Mettre à jour le planning",
    "Préparer le repas",
    "Payer une facture",
  ];
  const archivedTasks = [];
  for (let daysAgo = 120; daysAgo >= 1; daysAgo--) {
    const weekend = [0, 6].includes(new Date(Date.now() - daysAgo * 86_400_000).getDay());
    // Plus d'activité récemment et en semaine
    const count = Math.floor(random() * (weekend ? 2 : 4) + (daysAgo < 30 ? 1 : 0) - (random() < 0.25 ? 2 : 0));
    for (let i = 0; i < count; i++) {
      const completedAt = new Date(Date.now() - daysAgo * 86_400_000 + Math.floor(random() * 8) * 3_600_000);
      archivedTasks.push({
        userId: user.id,
        title: history[Math.floor(random() * history.length)],
        status: "DONE" as const,
        priority: (["LOW", "MEDIUM", "MEDIUM", "HIGH"] as const)[Math.floor(random() * 4)],
        projectId: random() < 0.5 ? perso.id : travail.id,
        createdAt: new Date(completedAt.getTime() - 2 * 86_400_000),
        completedAt,
        archivedAt: completedAt,
      });
    }
  }
  await prisma.task.createMany({ data: archivedTasks });

  // Sessions Pomodoro de la semaine écoulée
  const sessions = [];
  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const n = Math.floor(random() * 4);
    for (let i = 0; i < n; i++) {
      const startedAt = new Date(Date.now() - daysAgo * 86_400_000 - (i + 1) * 3_600_000);
      sessions.push({
        userId: user.id,
        type: "WORK" as const,
        durationMin: 25,
        startedAt,
        endedAt: new Date(startedAt.getTime() + 25 * 60_000),
        completed: true,
      });
    }
  }
  await prisma.pomodoroSession.createMany({ data: sessions });

  console.log(`Seed OK : ${DEMO_EMAIL} / ${DEMO_PASSWORD} (${archivedTasks.length} tâches d'historique, ${sessions.length} sessions Pomodoro)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
