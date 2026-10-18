import request from "supertest";
import { describe, expect, it } from "vitest";
import { app, loggedInAgent } from "./helpers.js";

type Agent = Awaited<ReturnType<typeof loggedInAgent>>;

async function createTask(agent: Agent, data: Record<string, unknown>) {
  const res = await agent.post("/api/tasks").send(data);
  if (res.status !== 201) throw new Error(`Création impossible : ${JSON.stringify(res.body)}`);
  return res.body.task;
}

const titles = (res: request.Response) => res.body.tasks.map((t: { title: string }) => t.title);

describe("Création et lecture", () => {
  it("exige d'être connecté", async () => {
    expect((await request(app).get("/api/tasks")).status).toBe(401);
  });

  it("crée une tâche complète avec étiquettes et sous-tâches", async () => {
    const agent = await loggedInAgent();
    const project = (await agent.post("/api/projects").send({ name: "Travail" })).body.project;
    const tag = (await agent.post("/api/tags").send({ name: "urgent" })).body.tag;

    const task = await createTask(agent, {
      title: "  Préparer la démo  ",
      description: "Slides + script",
      priority: "HIGH",
      dueDate: "2026-11-02T09:00:00.000Z",
      allDay: false,
      projectId: project.id,
      tagIds: [tag.id],
      subtasks: ["Slides", "Script"],
    });

    expect(task).toMatchObject({
      title: "Préparer la démo",
      status: "TODO",
      priority: "HIGH",
      dueDate: "2026-11-02T09:00:00.000Z",
      allDay: false,
      completedAt: null,
      project: { id: project.id, name: "Travail" },
      tags: [{ id: tag.id, name: "urgent" }],
    });
    expect(task.subtasks.map((s: { title: string }) => s.title)).toEqual(["Slides", "Script"]);

    const fetched = await agent.get(`/api/tasks/${task.id}`);
    expect(fetched.body.task.id).toBe(task.id);
  });

  it("place chaque nouvelle tâche en bas de sa colonne", async () => {
    const agent = await loggedInAgent();
    const a = await createTask(agent, { title: "A" });
    const b = await createTask(agent, { title: "B" });
    const c = await createTask(agent, { title: "C", status: "IN_PROGRESS" });
    expect([a.position, b.position, c.position]).toEqual([0, 1, 0]);
  });

  it("valide les données", async () => {
    const agent = await loggedInAgent();
    expect((await agent.post("/api/tasks").send({ title: "" })).status).toBe(400);
    expect((await agent.post("/api/tasks").send({ title: "X", priority: "ENORME" })).status).toBe(400);
    expect((await agent.post("/api/tasks").send({ title: "X", dueDate: "pas une date" })).status).toBe(400);
  });

  it("refuse une liste ou une étiquette appartenant à un autre utilisateur", async () => {
    const alice = await loggedInAgent("Alice");
    const bob = await loggedInAgent("Bob");
    const project = (await alice.post("/api/projects").send({ name: "Privé" })).body.project;
    const tag = (await alice.post("/api/tags").send({ name: "privé" })).body.tag;

    expect((await bob.post("/api/tasks").send({ title: "X", projectId: project.id })).status).toBe(404);
    expect((await bob.post("/api/tasks").send({ title: "X", tagIds: [tag.id] })).status).toBe(400);
  });

  it("isole les tâches de chaque utilisateur", async () => {
    const alice = await loggedInAgent("Alice");
    const bob = await loggedInAgent("Bob");
    const task = await createTask(alice, { title: "Secret" });

    expect((await bob.get("/api/tasks")).body.tasks).toHaveLength(0);
    expect((await bob.get(`/api/tasks/${task.id}`)).status).toBe(404);
    expect((await bob.patch(`/api/tasks/${task.id}`).send({ title: "Piraté" })).status).toBe(404);
    expect((await bob.delete(`/api/tasks/${task.id}`)).status).toBe(404);
    expect((await bob.post(`/api/tasks/${task.id}/subtasks`).send({ title: "x" })).status).toBe(404);
  });
});

describe("Filtres et tri", () => {
  async function seed(agent: Agent) {
    const project = (await agent.post("/api/projects").send({ name: "Perso" })).body.project;
    const tag = (await agent.post("/api/tags").send({ name: "maison" })).body.tag;
    await createTask(agent, { title: "Courses", priority: "LOW", dueDate: "2026-10-18T10:00:00Z", projectId: project.id, tagIds: [tag.id] });
    await createTask(agent, { title: "Loyer", priority: "URGENT", dueDate: "2026-10-15T10:00:00Z", projectId: project.id });
    await createTask(agent, { title: "Lire", priority: "MEDIUM", status: "DONE", description: "un roman" });
    await createTask(agent, { title: "Sport", priority: "HIGH", dueDate: "2026-10-25T10:00:00Z", subtasks: ["Acheter des baskets"] });
    return { project, tag };
  }

  it("filtre par statut (liste séparée par des virgules)", async () => {
    const agent = await loggedInAgent();
    await seed(agent);
    expect(titles(await agent.get("/api/tasks?status=DONE"))).toEqual(["Lire"]);
    expect(await agent.get("/api/tasks?status=TODO,IN_PROGRESS").then((r) => r.body.tasks.length)).toBe(3);
  });

  it("filtre par priorité, liste, « sans liste » et étiquette", async () => {
    const agent = await loggedInAgent();
    const { project, tag } = await seed(agent);
    expect(titles(await agent.get("/api/tasks?priority=URGENT,HIGH")).sort()).toEqual(["Loyer", "Sport"]);
    expect(titles(await agent.get(`/api/tasks?projectId=${project.id}`)).sort()).toEqual(["Courses", "Loyer"]);
    expect(titles(await agent.get("/api/tasks?projectId=none")).sort()).toEqual(["Lire", "Sport"]);
    expect(titles(await agent.get(`/api/tasks?tagId=${tag.id}`))).toEqual(["Courses"]);
  });

  it("recherche dans le titre, la description et les sous-tâches, sans tenir compte de la casse", async () => {
    const agent = await loggedInAgent();
    await seed(agent);
    expect(titles(await agent.get("/api/tasks?q=LOY"))).toEqual(["Loyer"]);
    expect(titles(await agent.get("/api/tasks?q=roman"))).toEqual(["Lire"]);
    expect(titles(await agent.get("/api/tasks?q=baskets"))).toEqual(["Sport"]);
  });

  it("filtre par intervalle d'échéance et sans échéance", async () => {
    const agent = await loggedInAgent();
    await seed(agent);
    const day = await agent.get("/api/tasks?dueFrom=2026-10-18T00:00:00Z&dueTo=2026-10-19T00:00:00Z");
    expect(titles(day)).toEqual(["Courses"]);
    // « En retard » : échéance avant aujourd'hui et pas encore faite
    const overdue = await agent.get("/api/tasks?dueTo=2026-10-18T00:00:00Z&status=TODO,IN_PROGRESS");
    expect(titles(overdue)).toEqual(["Loyer"]);
    expect(titles(await agent.get("/api/tasks?noDue=true"))).toEqual(["Lire"]);
  });

  it("trie par échéance (sans date en dernier) et par priorité", async () => {
    const agent = await loggedInAgent();
    await seed(agent);
    expect(titles(await agent.get("/api/tasks?sort=dueDate"))).toEqual(["Loyer", "Courses", "Sport", "Lire"]);
    expect(titles(await agent.get("/api/tasks?sort=priority&order=desc"))).toEqual(["Loyer", "Sport", "Lire", "Courses"]);
  });
});

describe("Modification", () => {
  it("renseigne completedAt quand la tâche passe à DONE et l'efface sinon", async () => {
    const agent = await loggedInAgent();
    const task = await createTask(agent, { title: "A" });

    const done = await agent.patch(`/api/tasks/${task.id}`).send({ status: "DONE" });
    expect(done.body.task.completedAt).not.toBeNull();

    const reopened = await agent.patch(`/api/tasks/${task.id}`).send({ status: "TODO" });
    expect(reopened.body.task.completedAt).toBeNull();
  });

  it("déplace la tâche en bas de la nouvelle colonne, ou à la position demandée (Kanban)", async () => {
    const agent = await loggedInAgent();
    await createTask(agent, { title: "En cours 1", status: "IN_PROGRESS" });
    const task = await createTask(agent, { title: "A" });

    const moved = await agent.patch(`/api/tasks/${task.id}`).send({ status: "IN_PROGRESS" });
    expect(moved.body.task.position).toBe(1);

    const placed = await agent.patch(`/api/tasks/${task.id}`).send({ status: "DONE", position: 0.5 });
    expect(placed.body.task.position).toBe(0.5);
  });

  it("remplace les étiquettes et peut retirer la liste et l'échéance", async () => {
    const agent = await loggedInAgent();
    const project = (await agent.post("/api/projects").send({ name: "P" })).body.project;
    const t1 = (await agent.post("/api/tags").send({ name: "un" })).body.tag;
    const t2 = (await agent.post("/api/tags").send({ name: "deux" })).body.tag;
    const task = await createTask(agent, { title: "A", projectId: project.id, tagIds: [t1.id], dueDate: "2026-10-20" });

    const res = await agent
      .patch(`/api/tasks/${task.id}`)
      .send({ tagIds: [t2.id], projectId: null, dueDate: null });
    expect(res.body.task.tags.map((t: { name: string }) => t.name)).toEqual(["deux"]);
    expect(res.body.task.projectId).toBeNull();
    expect(res.body.task.dueDate).toBeNull();
  });

  it("archive et désarchive une tâche", async () => {
    const agent = await loggedInAgent();
    const task = await createTask(agent, { title: "Vieille" });

    await agent.patch(`/api/tasks/${task.id}`).send({ archived: true });
    expect((await agent.get("/api/tasks")).body.tasks).toHaveLength(0);
    expect(titles(await agent.get("/api/tasks?view=archived"))).toEqual(["Vieille"]);

    await agent.patch(`/api/tasks/${task.id}`).send({ archived: false });
    expect(titles(await agent.get("/api/tasks"))).toEqual(["Vieille"]);
  });

  it("réarme le rappel quand reminderAt change", async () => {
    const agent = await loggedInAgent();
    const task = await createTask(agent, { title: "A" });
    const res = await agent.patch(`/api/tasks/${task.id}`).send({ reminderAt: "2026-10-20T08:00:00Z" });
    expect(res.body.task).toMatchObject({ reminderAt: "2026-10-20T08:00:00.000Z", reminded: false });
  });

  it("duplique une tâche avec ses sous-tâches et étiquettes", async () => {
    const agent = await loggedInAgent();
    const tag = (await agent.post("/api/tags").send({ name: "x" })).body.tag;
    const task = await createTask(agent, { title: "Modèle", status: "DONE", tagIds: [tag.id], subtasks: ["a", "b"] });

    const res = await agent.post(`/api/tasks/${task.id}/duplicate`);
    expect(res.status).toBe(201);
    expect(res.body.task).toMatchObject({ title: "Modèle (copie)", status: "TODO", completedAt: null });
    expect(res.body.task.tags).toHaveLength(1);
    expect(res.body.task.subtasks.map((s: { title: string; done: boolean }) => [s.title, s.done])).toEqual([
      ["a", false],
      ["b", false],
    ]);
  });
});

describe("Corbeille", () => {
  it("met à la corbeille, restaure, puis supprime définitivement", async () => {
    const agent = await loggedInAgent();
    const task = await createTask(agent, { title: "A" });

    expect((await agent.delete(`/api/tasks/${task.id}`)).status).toBe(204);
    expect((await agent.get("/api/tasks")).body.tasks).toHaveLength(0);
    expect(titles(await agent.get("/api/tasks?view=trash"))).toEqual(["A"]);

    const restored = await agent.post(`/api/tasks/${task.id}/restore`);
    expect(restored.body.task.deletedAt).toBeNull();
    expect((await agent.post(`/api/tasks/${task.id}/restore`)).status).toBe(400);

    expect((await agent.delete(`/api/tasks/${task.id}?permanent=true`)).status).toBe(204);
    expect((await agent.get(`/api/tasks/${task.id}`)).status).toBe(404);
  });

  it("vide la corbeille sans toucher aux autres tâches ni aux autres utilisateurs", async () => {
    const alice = await loggedInAgent("Alice");
    const bob = await loggedInAgent("Bob");
    const a1 = await createTask(alice, { title: "A1" });
    await createTask(alice, { title: "A2" });
    const b1 = await createTask(bob, { title: "B1" });
    await alice.delete(`/api/tasks/${a1.id}`);
    await bob.delete(`/api/tasks/${b1.id}`);

    const res = await alice.delete("/api/tasks/trash");
    expect(res.body.deleted).toBe(1);
    expect(titles(await alice.get("/api/tasks"))).toEqual(["A2"]);
    expect(titles(await bob.get("/api/tasks?view=trash"))).toEqual(["B1"]);
  });
});

describe("Sous-tâches", () => {
  it("ajoute, coche, renomme et supprime une sous-tâche", async () => {
    const agent = await loggedInAgent();
    const task = await createTask(agent, { title: "A", subtasks: ["Existante"] });

    const added = await agent.post(`/api/tasks/${task.id}/subtasks`).send({ title: "Nouvelle" });
    expect(added.status).toBe(201);
    expect(added.body.subtask.position).toBe(1);

    const sid = added.body.subtask.id;
    const updated = await agent.patch(`/api/tasks/${task.id}/subtasks/${sid}`).send({ done: true, title: "Renommée" });
    expect(updated.body.subtask).toMatchObject({ done: true, title: "Renommée" });

    expect((await agent.delete(`/api/tasks/${task.id}/subtasks/${sid}`)).status).toBe(204);
    const after = await agent.get(`/api/tasks/${task.id}`);
    expect(after.body.task.subtasks.map((s: { title: string }) => s.title)).toEqual(["Existante"]);
  });

  it("refuse une sous-tâche qui n'appartient pas à la tâche indiquée", async () => {
    const agent = await loggedInAgent();
    const a = await createTask(agent, { title: "A", subtasks: ["de A"] });
    const b = await createTask(agent, { title: "B" });
    const res = await agent.patch(`/api/tasks/${b.id}/subtasks/${a.subtasks[0].id}`).send({ done: true });
    expect(res.status).toBe(404);
  });
});
