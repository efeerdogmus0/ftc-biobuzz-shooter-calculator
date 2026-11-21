// A plan as plain text a team can paste into its notes or turn into code:
// one line per step with times and field coordinates.
import type { Plan, Step } from "./planner";
import type { Pose } from "./field";

const deg = 180 / Math.PI;
const n = (v: number, d = 2) => v.toFixed(d);
const at = (p: Pose) =>
  `x ${n(p.x)} m, y ${n(p.y)} m, ${Math.round(p.h * deg)}°`;

export type Translate = ((s: string) => string) & {
  f: (s: string, v: Record<string, string | number>) => string;
};

/** `hoodOffset`: added to the hood angle, as everywhere else in the app. */
export function stepText(s: Step, t: Translate, hoodOffset = 0): string {
  if (s.kind === "drive")
    return `${t("Sür")}: ${
      s.to === "pickup"
        ? t.f("{s} için", { s: t(s.source ?? "") })
        : t(s.to === "shoot" ? "Atış noktasına" : "Park")
    }`;
  if (s.kind === "pickup")
    return `${t("Al")}: ${t(s.source)} · ${s.balls} POLLEN`;
  if (s.kind === "shoot")
    return `${t("At")}: ${s.balls} POLLEN · ${t(s.cell === "first" ? "ilk CELL" : "ikinci CELL")} · ${t.f("açı {a}°", { a: n((s.spot.angle + hoodOffset) * deg, 1) })} · ${Math.round((s.spot.omega * 60) / 2 / Math.PI)} RPM`;
  if (s.kind === "wait") return `${t("Bekle")}: ${t(s.label)}`;
  return `${t("HIVE devriliyor")} (+20)`;
}

export function planText(
  plan: Plan,
  robotName: string,
  start: Pose,
  t: Translate,
  hoodOffset = 0,
): string {
  const lines = [
    `${t("Oto planı")} · ${robotName}`,
    `${plan.score} ${t("puan")} (LEAVE ${plan.breakdown.leave} · PARK ${plan.breakdown.park} · TIP ${plan.breakdown.tip}) · ${t.f("Bitiş {t} s", { t: n(plan.end, 1) })}`,
    t(
      "Koordinatlar: saha merkezi orijin, +x mavi ittifak duvarı, +y seyirciden uzak; robotun dönme noktası.",
    ),
    `${t("Başlangıç")}: ${at(start)}`,
    "",
  ];
  plan.steps.forEach((s, i) => {
    const where =
      s.kind === "drive"
        ? ` → ${at(s.leg.to)}`
        : s.kind === "tip"
          ? ""
          : ` @ ${at(s.pose)}`;
    lines.push(
      `${String(i + 1).padStart(2)}. ${n(s.t0, 1).padStart(4)}–${n(s.t1, 1).padStart(4)} s  ${stepText(s, t, hoodOffset)}${where}`,
    );
    if (s.kind === "drive")
      for (const w of s.leg.waypoints)
        lines.push(`      ${t("ara nokta")} x ${n(w.x)} m, y ${n(w.y)} m`);
  });
  for (const note of plan.notes)
    lines.push("", t.f(note.text, note.values ?? {}));
  return lines.join("\n");
}
