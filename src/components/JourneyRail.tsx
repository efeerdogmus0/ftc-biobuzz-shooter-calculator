// The six-stage rail under the tool bar: where the student is, what is done,
// what needs attention. Navigation only; it never edits the robot.
import { Check, TriangleAlert } from "lucide-react";
import { stages, type StageId, type StageStatus } from "../app/journey";
import { useT } from "../i18n/useT";

const statusText: Record<StageStatus, string> = {
  todo: "henüz yapılmadı",
  done: "tamam",
  warn: "dikkat",
};

export function JourneyRail({
  active,
  status,
  go,
}: {
  active: StageId;
  status: Record<StageId, StageStatus>;
  go: (id: StageId) => void;
}) {
  const t = useT();
  return (
    <nav className="journey-rail" aria-label={t("Adımlar")}>
      <ol>
        {stages.map((st, i) => {
          const state = status[st.id];
          return (
            <li key={st.id}>
              <button
                className={`${active === st.id ? "active" : ""} ${state}`}
                aria-current={active === st.id ? "step" : undefined}
                title={`${t(st.question)} · ${t(statusText[state])}`}
                onClick={() => go(st.id)}
              >
                <span className="rail-num" aria-hidden="true">
                  {state === "done" ? (
                    <Check size={12} strokeWidth={3} />
                  ) : state === "warn" && active !== st.id ? (
                    <TriangleAlert size={11} />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="rail-text">
                  <b>{t(st.label)}</b>
                  <small>{t(st.question)}</small>
                </span>
                <span className="sr-only">{t(statusText[state])}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
