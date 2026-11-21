// Loads the auto planner on demand. In builds without the private Probot Sim
// copy, "virtual:auto-planner" is a short "not available" screen.
import { lazy, Suspense } from "react";
import { useT } from "../i18n/useT";

const AutoPlanner = lazy(() => import("virtual:auto-planner"));

export default function AutoPlannerEntry({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Suspense fallback={<p className="auto-loading">{t("Yükleniyor…")}</p>}>
      <AutoPlanner onClose={onClose} />
    </Suspense>
  );
}
