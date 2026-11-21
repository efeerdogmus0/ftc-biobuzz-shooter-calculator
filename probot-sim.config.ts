// Wiring for the auto planner, which builds on Probot Sim sources copied into
// vendor/probot-sim/ by scripts/sync-probot-sim.mjs (private, git-ignored).
// Without that copy the public app builds as before and the planner entry
// resolves to a short "not available in this build" screen.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export const probotSimAvailable = existsSync(
  at("./vendor/probot-sim/src/yol/rota.ts"),
);

export const probotSimAlias = {
  "@probot-sim": at("./vendor/probot-sim/src"),
  "@probot-studio/builder-core": at(
    "./vendor/probot-sim/vendor/builder-core/src",
  ),
  "@probot-studio/katalog": at("./vendor/probot-sim/vendor/katalog"),
};

const ID = "virtual:auto-planner";
export function autoPlannerEntry(): Plugin {
  return {
    name: "auto-planner-entry",
    resolveId(id) {
      if (id !== ID) return null;
      return probotSimAvailable
        ? at("./src/auto/AutoPlanner.tsx")
        : at("./src/autoUnavailable.tsx");
    },
  };
}
