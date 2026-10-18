import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/globalSetup.ts"],
    setupFiles: ["./test/setup.ts"],
    // Les tests partagent la même base : on les exécute un fichier à la fois
    fileParallelism: false,
  },
});
