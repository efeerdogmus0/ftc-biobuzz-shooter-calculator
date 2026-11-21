/** True when the private Probot Sim copy was present at build time. */
declare const __PROBOT_SIM__: boolean;

declare module "virtual:auto-planner" {
  import type { ComponentType } from "react";
  const AutoPlanner: ComponentType<{ onClose: () => void }>;
  export default AutoPlanner;
}
