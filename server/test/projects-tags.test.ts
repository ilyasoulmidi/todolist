import request from "supertest";
import { describe, expect, it } from "vitest";
import { app, loggedInAgent } from "./helpers.js";

describe("Listes (/api/projects)", () => {
  it("exige d'être connecté", async () => {
    expect((await request(app).get("/api/projects")).status).toBe(401);
  });

  it("crée des listes à la suite et les renvoie dans l'ordre", async () => {
    const agent = await loggedInAgent();
    const a = await agent.post("/api/projects").send({ name: "Perso", color: "#22c55e" });
    const b = await agent.post("/api/projects").send({ name: "Travail" });

    expect(a.status).toBe(201);
    expect(a.body.project).toMatchObject({ name: "Perso", color: "#22c55e", position: 0, openTaskCount: 0 });
    expect(b.body.project.position).toBe(1);

    const list = await agent.get("/api/projects");
    expect(list.body.projects.map((p: { name: string }) => p.name)).toEqual(["Perso", "Travail"]);
  });

  it("valide la couleur", async () => {
    const agent = await loggedInAgent();
    const res = await agent.post("/api/projects").send({ name: "X", color: "rouge" });
    expect(res.status).toBe(400);
  });

  it("compte les tâches ouvertes", async () => {
    const agent = await loggedInAgent();
    const { body } = await agent.post("/api/projects").send({ name: "Perso" });
    const projectId = body.project.id;
    await agent.post("/api/tasks").send({ title: "A", projectId });
    await agent.post("/api/tasks").send({ title: "B", projectId, status: "DONE" });

    const list = await agent.get("/api/projects");
    expect(list.body.projects[0].openTaskCount).toBe(1);
  });

  it("archive et désarchive une liste", async () => {
    const agent = await loggedInAgent();
    const { body } = await agent.post("/api/projects").send({ name: "Ancien" });
    const id = body.project.id;

    const archived = await agent.patch(`/api/projects/${id}`).send({ archived: true });
    expect(archived.body.project.archivedAt).not.toBeNull();
    expect((await agent.get("/api/projects")).body.projects).toHaveLength(0);
    expect((await agent.get("/api/projects?archived=true")).body.projects).toHaveLength(1);

    const restored = await agent.patch(`/api/projects/${id}`).send({ archived: false });
    expect(restored.body.project.archivedAt).toBeNull();
  });

  it("supprime une liste en gardant ses tâches (sans liste)", async () => {
    const agent = await loggedInAgent();
    const { body } = await agent.post("/api/projects").send({ name: "Temp" });
    const task = await agent.post("/api/tasks").send({ title: "Garde-moi", projectId: body.project.id });

    expect((await agent.delete(`/api/projects/${body.project.id}`)).status).toBe(204);
    const after = await agent.get(`/api/tasks/${task.body.task.id}`);
    expect(after.body.task.projectId).toBeNull();
  });

  it("n'expose pas les listes d'un autre utilisateur", async () => {
    const alice = await loggedInAgent("Alice");
    const bob = await loggedInAgent("Bob");
    const { body } = await alice.post("/api/projects").send({ name: "Privé" });

    expect((await bob.get("/api/projects")).body.projects).toHaveLength(0);
    expect((await bob.patch(`/api/projects/${body.project.id}`).send({ name: "Piraté" })).status).toBe(404);
    expect((await bob.delete(`/api/projects/${body.project.id}`)).status).toBe(404);
  });
});

describe("Étiquettes (/api/tags)", () => {
  it("crée, renomme et supprime une étiquette", async () => {
    const agent = await loggedInAgent();
    const created = await agent.post("/api/tags").send({ name: "urgent", color: "#ef4444" });
    expect(created.status).toBe(201);

    const id = created.body.tag.id;
    const renamed = await agent.patch(`/api/tags/${id}`).send({ name: "important" });
    expect(renamed.body.tag.name).toBe("important");

    expect((await agent.delete(`/api/tags/${id}`)).status).toBe(204);
    expect((await agent.get("/api/tags")).body.tags).toHaveLength(0);
  });

  it("refuse deux étiquettes du même nom (409)", async () => {
    const agent = await loggedInAgent();
    await agent.post("/api/tags").send({ name: "maison" });
    const res = await agent.post("/api/tags").send({ name: "maison" });
    expect(res.status).toBe(409);
  });

  it("autorise le même nom chez deux utilisateurs différents", async () => {
    const alice = await loggedInAgent("Alice");
    const bob = await loggedInAgent("Bob");
    await alice.post("/api/tags").send({ name: "maison" });
    expect((await bob.post("/api/tags").send({ name: "maison" })).status).toBe(201);
  });

  it("trie les étiquettes par nom", async () => {
    const agent = await loggedInAgent();
    await agent.post("/api/tags").send({ name: "zèbre" });
    await agent.post("/api/tags").send({ name: "abeille" });
    const { body } = await agent.get("/api/tags");
    expect(body.tags.map((t: { name: string }) => t.name)).toEqual(["abeille", "zèbre"]);
  });
});
