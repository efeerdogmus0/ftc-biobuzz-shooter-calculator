// Stand-in for the auto planner in builds without the Probot Sim copy.
import { useT } from "./i18n/useT";

export default function AutoPlannerUnavailable({
  onClose,
}: {
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div className="auto-unavailable">
      <p>
        {t("Oto planlayıcı bu derlemede yok: Probot Sim kaynakları gerekiyor.")}
      </p>
      <button className="primary" onClick={onClose}>
        {t("Simülasyona dön")}
      </button>
    </div>
  );
}
