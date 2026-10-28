import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
