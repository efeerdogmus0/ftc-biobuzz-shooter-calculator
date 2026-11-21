// Stage 1 · Robot: which robot this is, its setup, the motor / gear choice and
// the mechanism clearance check.
import { Ruler } from "lucide-react";
import type { AnalysisState } from "../../app/useAnalysis";
import { NumberInput as N, Section } from "../Inputs";
import { MotorExplorer } from "../MotorExplorer";
import { RobotCard } from "../RobotSetup";
import { useT } from "../../i18n/useT";

export function RobotStage({
  a,
  openTool,
}: {
  a: AnalysisState;
  openTool: (tool: string) => void;
}) {
  const t = useT();
  return (
    <div className="simple-panel">
      <p className="stage-lead">
        {t(
          "Diğer bütün adımlar buradaki robotu kullanır. Ölçülerin değişirse önce burayı güncelle.",
        )}
      </p>
      <RobotCard />
      <Section title="Shooter'ın yeri" open>
        <N
          label="Çıkış yüksekliği"
          path="robot.exitOffset.2"
          kind="diameter"
          min={0.05}
          max={2}
        />
        <button className="wide" onClick={() => openTool("clearance")}>
          <Ruler size={13} /> {t("Shooter açıklığını kontrol et…")}
        </button>
        <p className="muted">
          {t(
            "Top tekerle hood arasından rahat geçiyor mu, mekanizma kesitinde bakar.",
          )}
        </p>
      </Section>
      <MotorExplorer a={a} />
    </div>
  );
}
