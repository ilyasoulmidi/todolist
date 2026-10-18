import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { loggedInAgent } from "./helpers.js";

type Agent = Awaited<ReturnType<typeof loggedInAgent>>;

async function createTask(agent: Agent, data: Record<string, unknown>) {
  const res = await agent.post("/api/tasks").send(data);
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body.task;
}

function utcDay(offsetDays: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays));
}

describe("Tâches récurrentes", () => {
  it("refuse une règle invalide", async () => {
    const agent = await loggedInAgent();
    const res = await agent.post("/api/tasks").send({ title: "X", recurrenceRule: "FREQ=SOUVENT" });
    expect(res.status).toBe(400);
  });

  it("crée l'occurrence suivante en terminant la tâche, avec étiquettes et sous-tâches remises à zéro", async () => {
    const agent = await loggedInAgent();
    const tag = (await agent.post("/api/tags").send({ name: "maison" })).body.tag;
    const due = utcDay(2);
    const task = await createTask(agent, {
      title: "Sortir les poubelles",
      dueDate: due.toISOString(),
      reminderAt: new Date(due.getTime() - 60 * 60 * 1000).toISOString(),
      recurrenceRule: "FREQ=WEEKLY",
      tagIds: [tag.id],
      subtasks: ["Recyclage"],
    });
    await agent.patch(`/api/tasks/${task.id}/subtasks/${task.subtasks[0].id}`).send({ done: true });

    const res = await agent.patch(`/api/tasks/${task.id}`).send({ status: "DONE" });
    expect(res.status).toBe(200);
    const next = res.body.nextTask;
    expect(next).toMatchObject({
      title: "Sortir les poubelles",
      status: "TODO",
      recurrenceRule: "FREQ=WEEKLY",
      recurrenceParentId: task.id,
      dueDate: utcDay(9).toISOString(),
      // Rappel décalé d'autant que l'échéance
      reminderAt: new Date(utcDay(9).getTime() - 60 * 60 * 1000).toISOString(),
      reminded: false,
    });
    expect(next.tags.map((t: { name: string }) => t.name)).toEqual(["maison"]);
    expect(next.subtasks.map((s: { title: string; done: boolean }) => [s.title, s.done])).toEqual([["Recyclage", false]]);
  });

  it("ne duplique pas l'occurrence si on rouvre puis termine à nouveau", async () => {
    const agent = await loggedInAgent();
    const task = await createTask(agent, { title: "Arroser", dueDate: utcDay(0).toISOString(), recurrenceRule: "FREQ=DAILY" });

    await agent.patch(`/api/tasks/${task.id}`).send({ status: "DONE" });
    await agent.patch(`/api/tasks/${task.id}`).send({ status: "TODO" });
    const again = await agent.patch(`/api/tasks/${task.id}`).send({ status: "DONE" });

    expect(again.body.nextTask).toBeNull();
    const all = await agent.get("/api/tasks?q=Arroser");
    expect(all.body.tasks).toHaveLength(2);
  });

  it("ne programme jamais l'occurrence suivante dans le passé", async () => {
    const agent = await loggedInAgent();
    const task = await createTask(agent, { title: "Sport", dueDate: utcDay(-10).toISOString(), recurrenceRule: "FREQ=DAILY;INTERVAL=3" });
    const res = await agent.patch(`/api/tasks/${task.id}`).send({ status: "DONE" });
    const nextDue = new Date(res.body.nextTask.dueDate);
    expect(nextDue >= utcDay(0)).toBe(true);
    expect(nextDue < utcDay(3)).toBe(true);
  });

  it("utilise aujourd'hui comme base quand la tâche n'a pas d'échéance", async () => {
    const agent = await loggedInAgent();
    const task = await createTask(agent, { title: "Méditer", recurrenceRule: "FREQ=DAILY" });
    const res = await agent.patch(`/api/tasks/${task.id}`).send({ status: "DONE" });
    expect(res.body.nextTask.dueDate).toBe(utcDay(1).toISOString());
  });

  it("ne crée rien pour une tâche non récurrente", async () => {
    const agent = await loggedInAgent();
    const task = await createTask(agent, { title: "Unique" });
    const res = await agent.patch(`/api/tasks/${task.id}`).send({ status: "DONE" });
    expect(res.body.nextTask).toBeNull();
  });
});

describe("Rappels", () => {
  it("liste les rappels échus non notifiés, puis plus après acquittement", async () => {
    const agent = await loggedInAgent();
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const due = await createTask(agent, { title: "Appeler maman", reminderAt: past });
    await createTask(agent, { title: "Plus tard", reminderAt: future });
    await createTask(agent, { title: "Déjà faite", reminderAt: past, status: "DONE" });

    const res = await agent.get("/api/tasks/reminders/due");
    expect(res.body.tasks.map((t: { title: string }) => t.title)).toEqual(["Appeler maman"]);

    expect((await agent.post(`/api/tasks/${due.id}/reminder/ack`)).status).toBe(204);
    expect((await agent.get("/api/tasks/reminders/due")).body.tasks).toHaveLength(0);
  });

  it("réarme le rappel quand on le modifie", async () => {
    const agent = await loggedInAgent();
    const past = new Date(Date.now() - 60_000).toISOString();
    const task = await createTask(agent, { title: "A", reminderAt: past });
    await agent.post(`/api/tasks/${task.id}/reminder/ack`);
    await agent.patch(`/api/tasks/${task.id}`).send({ reminderAt: new Date(Date.now() - 1000).toISOString() });
    expect((await agent.get("/api/tasks/reminders/due")).body.tasks).toHaveLength(1);
  });

  it("n'expose pas les rappels d'un autre utilisateur", async () => {
    const alice = await loggedInAgent("Alice");
    const bob = await loggedInAgent("Bob");
    const task = await createTask(alice, { title: "Secret", reminderAt: new Date(Date.now() - 1000).toISOString() });
    expect((await bob.get("/api/tasks/reminders/due")).body.tasks).toHaveLength(0);
    expect((await bob.post(`/api/tasks/${task.id}/reminder/ack`)).status).toBe(404);
  });
});

describe("Archivage et corbeille", () => {
  it("archive toutes les tâches terminées, ou celles d'une liste", async () => {
    const agent = await loggedInAgent();
    const project = (await agent.post("/api/projects").send({ name: "P" })).body.project;
    await createTask(agent, { title: "Fini 1", status: "DONE" });
    await createTask(agent, { title: "Fini 2", status: "DONE", projectId: project.id });
    await createTask(agent, { title: "En cours", status: "IN_PROGRESS" });

    const scoped = await agent.post("/api/tasks/archive-done").send({ projectId: project.id });
    expect(scoped.body.archived).toBe(1);
    const all = await agent.post("/api/tasks/archive-done").send({});
    expect(all.body.archived).toBe(1);

    const archived = await agent.get("/api/tasks?view=archived");
    expect(archived.body.tasks.map((t: { title: string }) => t.title).sort()).toEqual(["Fini 1", "Fini 2"]);
    expect((await agent.get("/api/tasks")).body.tasks).toHaveLength(1);
  });

  it("purge automatiquement la corbeille au-delà de 30 jours", async () => {
    const agent = await loggedInAgent();
    const old = await createTask(agent, { title: "Vieille" });
    const recent = await createTask(agent, { title: "Récente" });
    await agent.delete(`/api/tasks/${old.id}`);
    await agent.delete(`/api/tasks/${recent.id}`);
    await prisma.task.update({
      where: { id: old.id },
      data: { deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
    });

    const trash = await agent.get("/api/tasks?view=trash");
    expect(trash.body.tasks.map((t: { title: string }) => t.title)).toEqual(["Récente"]);
    expect(await prisma.task.findUnique({ where: { id: old.id } })).toBeNull();
  });
});
