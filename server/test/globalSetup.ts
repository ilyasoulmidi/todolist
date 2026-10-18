import { execSync } from "node:child_process";
import { config } from "dotenv";

export default function setup() {
  config({ path: ".env.test", override: true, quiet: true });
  // Applique les migrations sur la base de test avant de lancer les tests
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
}
