import request from "supertest";
import { createApp } from "../src/app.js";

export const app = createApp();

let counter = 0;

// Crée un compte et renvoie un agent qui garde le cookie de session
export async function loggedInAgent(name = "Testeur") {
  const agent = request.agent(app);
  counter += 1;
  const res = await agent
    .post("/api/auth/register")
    .send({ name, email: `user${counter}-${Date.now()}@example.test`, password: "motdepasse123" });
  if (res.status !== 201) throw new Error(`Inscription impossible : ${res.status}`);
  return agent;
}
