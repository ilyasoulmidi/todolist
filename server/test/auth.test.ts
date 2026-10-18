import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const app = createApp();

const alice = { name: "Alice", email: "alice@example.test", password: "motdepasse123" };

function getCookie(res: request.Response): string {
  const cookies = res.headers["set-cookie"] as unknown as string[] | undefined;
  const token = cookies?.find((c) => c.startsWith("token="));
  if (!token) throw new Error("Cookie token absent");
  return token.split(";")[0];
}

describe("POST /api/auth/register", () => {
  it("crée un compte, renvoie l'utilisateur sans le hash et pose un cookie httpOnly", async () => {
    const res = await request(app).post("/api/auth/register").send(alice);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: "Alice", email: alice.email });
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookie = (res.headers["set-cookie"] as unknown as string[])[0];
    expect(cookie).toMatch(/^token=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it("normalise l'email en minuscules", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...alice, email: "  Alice@Example.TEST " });
    expect(res.body.user.email).toBe("alice@example.test");
  });

  it("refuse un email déjà utilisé (409)", async () => {
    await request(app).post("/api/auth/register").send(alice);
    const res = await request(app).post("/api/auth/register").send(alice);
    expect(res.status).toBe(409);
  });

  it("valide les données (400)", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "", email: "pas-un-email", password: "court" });
    expect(res.status).toBe(400);
    const fields = res.body.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(["name", "email", "password"]));
  });
});

describe("POST /api/auth/login", () => {
  it("connecte avec les bons identifiants", async () => {
    await request(app).post("/api/auth/register").send(alice);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: alice.email, password: alice.password });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(alice.email);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(getCookie(res)).toMatch(/^token=.+/);
  });

  it("refuse un mauvais mot de passe ou un email inconnu avec le même message", async () => {
    await request(app).post("/api/auth/register").send(alice);
    const wrongPwd = await request(app)
      .post("/api/auth/login")
      .send({ email: alice.email, password: "mauvais" });
    const unknown = await request(app)
      .post("/api/auth/login")
      .send({ email: "inconnu@example.test", password: "peu-importe" });

    expect(wrongPwd.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPwd.body.error).toBe(unknown.body.error);
  });
});

describe("GET /api/auth/me", () => {
  it("renvoie 401 sans cookie", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("renvoie 401 avec un jeton falsifié", async () => {
    const res = await request(app).get("/api/auth/me").set("Cookie", "token=abc.def.ghi");
    expect(res.status).toBe(401);
  });

  it("renvoie l'utilisateur connecté", async () => {
    const reg = await request(app).post("/api/auth/register").send(alice);
    const res = await request(app).get("/api/auth/me").set("Cookie", getCookie(reg));

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(alice.email);
  });
});

describe("POST /api/auth/logout", () => {
  it("efface le cookie", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(204);
    const cookie = (res.headers["set-cookie"] as unknown as string[])[0];
    expect(cookie).toMatch(/^token=;/);
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});

describe("Erreurs génériques", () => {
  it("renvoie 404 en JSON pour une route inconnue", async () => {
    const res = await request(app).get("/api/nexiste-pas");
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it("renvoie 400 pour un JSON mal formé", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{pas du json");
    expect(res.status).toBe(400);
  });
});
