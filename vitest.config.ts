import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Several suites drive the one local Postgres instance and mutate the ledger
    // (backup round-trip wipes every table; the import e2e inserts as the owner).
    // Run files one at a time so they cannot race each other for that shared state.
    // The whole suite takes seconds, so the lost parallelism costs little.
    fileParallelism: false
  }
});
