// Démarre PostgreSQL (Docker) et attend qu'il soit prêt ; lancé automatiquement avant `npm run dev`
import { spawnSync } from "node:child_process";

const result = spawnSync("docker", ["compose", "up", "-d", "--wait"], { stdio: "inherit" });

if (result.status !== 0) {
  console.error(
    "\n✖ Impossible de démarrer la base de données.\n" +
      "  → Vérifie que Docker Desktop est ouvert et démarré, puis relance : npm run dev\n",
  );
  process.exit(1);
}

console.log("✔ Base de données prête\n");
