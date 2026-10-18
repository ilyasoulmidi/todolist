import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { parseCsv, toCsv } from "../src/lib/csv.js";
import { app, loggedInAgent } from "./helpers.js";

type Agent = Awaited<ReturnType<typeof loggedInAgent>>;

async function createTask(agent: Agent, data: Record<string, unknown>) {
  const res = await agent.post("/api/tasks").send(data);
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body.task;
}

describe("CSV", () => {
  it("échappe et relit les cellules avec guillemets, séparateurs et retours à la ligne", () => {
    const rows = [["simple", 'avec "guillemets"', "a;b", "ligne 1\nligne 2"]];
    const csv = toCsv(["h1", "h2", "h3", "h4"], rows);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(parseCsv(csv)).toEqual([["h1", "h2", "h3", "h4"], ...rows]);
  });

  it("détecte le séparateur virgule", () => {
    expect(parseCsv("titre,statut\nA,Fait\n")).toEqual([
      ["titre", "statut"],
      ["A", "Fait"],
    ]);
  });
});

describe("Pomodoro", () => {
  it("démarre et termine une session liée à une tâche", async () => {
    const agent = await loggedInAgent();
    const task = await createTask(agent, { title: "Rédiger" });

    const start = await agent.post("/api/pomodoros").send({ durationMin: 25, taskId: task.id });
    expect(start.status).toBe(201);
    expect(start.body.session).toMatchObject({ type: "WORK", durationMin: 25, taskId: task.id, endedAt: null });

    const end = await agent.patch(`/api/pomodoros/${start.body.session.id}`).send({ completed: true });
    expect(end.body.session).toMatchObject({ completed: true, durationMin: 25 });
    expect(end.body.session.endedAt).not.toBeNull();

    // Une session ne peut pas être terminée deux fois
    expect((await agent.patch(`/api/pomodoros/${start.body.session.id}`).send({ completed: true })).status).toBe(400);

    const list = await agent.get(`/api/pomodoros?taskId=${task.id}`);
    expect(list.body.sessions).toHaveLength(1);
  });

  it("ne compte que le temps réellement passé pour une session interrompue", async () => {
    const agent = await loggedInAgent();
    const start = await agent.post("/api/pomodoros").send({ durationMin: 25 });
    const end = await agent.patch(`/api/pomodoros/${start.body.session.id}`).send({ completed: false });
    expect(end.body.session).toMatchObject({ completed: false, durationMin: 0 });
  });

  it("refuse une tâche ou une session d'un autre utilisateur", async () => {
    const alice = await loggedInAgent("Alice");
    const bob = await loggedInAgent("Bob");
    const task = await createTask(alice, { title: "Privé" });
    expect((await bob.post("/api/pomodoros").send({ durationMin: 25, taskId: task.id })).status).toBe(404);

    const session = (await alice.post("/api/pomodoros").send({ durationMin: 25 })).body.session;
    expect((await bob.patch(`/api/pomodoros/${session.id}`).send({ completed: true })).status).toBe(404);
  });
});

describe("Statistiques", () => {
  it("exige d'être connecté", async () => {
    expect((await request(app).get("/api/stats")).status).toBe(401);
  });

  it("renvoie les données brutes de l'utilisateur uniquement", async () => {
    const agent = await loggedInAgent();
    const other = await loggedInAgent("Autre");
    const project = (await agent.post("/api/projects").send({ name: "Perso" })).body.project;
    await createTask(agent, { title: "Faite", status: "DONE" });
    await createTask(agent, { title: "Ouverte", priority: "URGENT", projectId: project.id });
    const deleted = await createTask(agent, { title: "Supprimée", status: "DONE" });
    await agent.delete(`/api/tasks/${deleted.id}`);
    await createTask(other, { title: "Pas à moi", status: "DONE" });
    const session = (await agent.post("/api/pomodoros").send({ durationMin: 25 })).body.session;
    await agent.patch(`/api/pomodoros/${session.id}`).send({ completed: true });

    const { body } = await agent.get("/api/stats");
    expect(body.completedAt).toHaveLength(1);
    expect(body.createdAt).toHaveLength(2);
    expect(body.open).toEqual([
      { status: "TODO", priority: "URGENT", dueDate: null, project: { id: project.id, name: "Perso", color: project.color } },
    ]);
    expect(body.pomodoros).toHaveLength(1);
    expect(body.totals).toEqual({ done: 1, all: 2 });
  });
});

describe("Export et import", () => {
  async function seed(agent: Agent) {
    const project = (await agent.post("/api/projects").send({ name: "Travail", color: "#3b82f6" })).body.project;
    const tag = (await agent.post("/api/tags").send({ name: "urgent", color: "#ef4444" })).body.tag;
    await createTask(agent, {
      title: 'Rapport "Q4"; version finale',
      description: "Ligne 1\nLigne 2",
      priority: "HIGH",
      status: "IN_PROGRESS",
      dueDate: "2026-11-02T00:00:00.000Z",
      projectId: project.id,
      tagIds: [tag.id],
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
      subtasks: ["Plan", "Relecture"],
    });
    await createTask(agent, { title: "Terminée", status: "DONE" });
  }

  it("exporte en JSON avec listes, étiquettes et sous-tâches", async () => {
    const agent = await loggedInAgent();
    await seed(agent);
    const res = await agent.get("/api/data/export?format=json");

    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="todolist-\d{4}-\d{2}-\d{2}\.json"/);
    expect(res.body).toMatchObject({
      app: "todolist",
      version: 1,
      projects: [{ name: "Travail", color: "#3b82f6" }],
      tags: [{ name: "urgent", color: "#ef4444" }],
    });
    expect(res.body.tasks).toHaveLength(2);
    expect(res.body.tasks.find((t: { title: string }) => t.title.startsWith("Rapport"))).toMatchObject({
      project: "Travail",
      tags: ["urgent"],
      subtasks: [
        { title: "Plan", done: false },
        { title: "Relecture", done: false },
      ],
    });
  });

  it("aller-retour JSON : un autre compte retrouve les mêmes données", async () => {
    const alice = await loggedInAgent("Alice");
    await seed(alice);
    const exported = (await alice.get("/api/data/export?format=json")).body;

    const bob = await loggedInAgent("Bob");
    const res = await bob.post("/api/data/import").send({ format: "json", data: exported });
    expect(res.status).toBe(201);
    expect(res.body.imported).toEqual({ tasks: 2, projects: 1, tags: 1 });

    const tasks = (await bob.get("/api/tasks?sort=title")).body.tasks;
    const rapport = tasks.find((t: { title: string }) => t.title.startsWith("Rapport"));
    expect(rapport).toMatchObject({
      status: "IN_PROGRESS",
      priority: "HIGH",
      description: "Ligne 1\nLigne 2",
      dueDate: "2026-11-02T00:00:00.000Z",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
      project: { name: "Travail", color: "#3b82f6" },
    });
    expect(rapport.tags.map((t: { name: string }) => t.name)).toEqual(["urgent"]);
    expect(tasks.find((t: { title: string }) => t.title === "Terminée").completedAt).not.toBeNull();
  });

  it("réutilise les listes et étiquettes existantes (sans tenir compte de la casse)", async () => {
    const agent = await loggedInAgent();
    await agent.post("/api/projects").send({ name: "travail" });
    await agent.post("/api/tags").send({ name: "URGENT" });
    const res = await agent.post("/api/data/import").send({
      format: "json",
      data: { tasks: [{ title: "X", project: "Travail", tags: ["urgent"] }] },
    });
    expect(res.body.imported).toEqual({ tasks: 1, projects: 0, tags: 0 });
    expect((await agent.get("/api/projects")).body.projects).toHaveLength(1);
  });

  it("aller-retour CSV, y compris cellules complexes et libellés français", async () => {
    const alice = await loggedInAgent("Alice");
    await seed(alice);
    const csv = await alice.get("/api/data/export?format=csv").buffer(true).parse((res, cb) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => cb(null, data));
    });
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    const text = csv.body as string;
    expect(text).toContain("En cours");
    expect(text).toContain("[ ] Plan | [ ] Relecture");

    const bob = await loggedInAgent("Bob");
    const res = await bob.post("/api/data/import").send({ format: "csv", content: text });
    expect(res.body.imported).toEqual({ tasks: 2, projects: 1, tags: 1 });

    const rapport = (await bob.get("/api/tasks")).body.tasks.find((t: { title: string }) => t.title.startsWith("Rapport"));
    expect(rapport).toMatchObject({
      title: 'Rapport "Q4"; version finale',
      description: "Ligne 1\nLigne 2",
      status: "IN_PROGRESS",
      priority: "HIGH",
      dueDate: "2026-11-02T00:00:00.000Z",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
    });
    expect(rapport.subtasks).toHaveLength(2);
  });

  it("importe un CSV minimal fait à la main (séparateur virgule)", async () => {
    const agent = await loggedInAgent();
    const res = await agent
      .post("/api/data/import")
      .send({ format: "csv", content: "titre,statut,priorite\nAcheter du pain,a faire,urgente\nAppeler Paul,FAIT,\n" });
    expect(res.body.imported.tasks).toBe(2);
    const tasks = (await agent.get("/api/tasks?sort=title")).body.tasks;
    expect(tasks.map((t: { title: string; status: string; priority: string }) => [t.title, t.status, t.priority])).toEqual([
      ["Acheter du pain", "TODO", "URGENT"],
      ["Appeler Paul", "DONE", "MEDIUM"],
    ]);
  });

  it("refuse un CSV sans colonne titre, sans rien importer", async () => {
    const agent = await loggedInAgent();
    const res = await agent.post("/api/data/import").send({ format: "csv", content: "nom;statut\nA;Fait\n" });
    expect(res.status).toBe(400);
    expect(await prisma.task.count()).toBe(0);
  });

  it("annule tout l'import si une tâche est invalide", async () => {
    const agent = await loggedInAgent();
    const res = await agent.post("/api/data/import").send({
      format: "json",
      data: { projects: [{ name: "Nouvelle" }], tasks: [{ title: "OK" }, { title: "" }] },
    });
    expect(res.status).toBe(400);
    expect((await agent.get("/api/projects")).body.projects).toHaveLength(0);
  });
});
