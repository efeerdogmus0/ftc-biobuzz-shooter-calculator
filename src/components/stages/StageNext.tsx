// The "what now?" button at the foot of every stage panel.
import { ArrowRight } from "lucide-react";
import { nextStage, type StageId } from "../../app/journey";
import { useT } from "../../i18n/useT";

export function StageNext({
  stage,
  go,
}: {
  stage: StageId;
  go: (id: StageId) => void;
}) {
  const t = useT();
  const next = nextStage(stage);
  if (!next) return null;
  return (
    <button className="stage-next" onClick={() => go(next.id)}>
      <span>
        <small>{t("Sıradaki adım")}</small>
        <b>
          {t(next.label)} · {t(next.question)}
        </b>
      </span>
      <ArrowRight size={16} />
    </button>
  );
}
