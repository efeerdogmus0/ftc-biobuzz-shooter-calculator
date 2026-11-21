import { defineConfig } from "vitest/config";
import {
  autoPlannerEntry,
  probotSimAlias,
  probotSimAvailable,
} from "./probot-sim.config";
// Auto planner tests need the private Probot Sim copy (scripts/sync-probot-sim.mjs).
export default defineConfig({
  plugins: [autoPlannerEntry()],
  resolve: { alias: probotSimAvailable ? probotSimAlias : {} },
  define: { __PROBOT_SIM__: JSON.stringify(probotSimAvailable) },
  test: {
    include: [
      "src/tests/**/*.test.ts",
      ...(probotSimAvailable ? ["src/auto/**/*.test.ts"] : []),
    ],
  },
});
