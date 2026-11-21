// The auto as a strip of time: one block per robot step, flags where the HIVE
// tips, the end of the auto period and a playhead. Click or drag to seek.
import { useRef } from "react";
import { useT } from "../i18n/useT";
import type { Plan } from "./planner";
import { legOk, type LegCheck } from "./verify";
import { stepText } from "./planText";

export default function Timeline({
  plan,
  time,
  span,
  autoLength,
  legs,
  onSeek,
}: {
  plan: Plan;
  time: number;
  span: number;
  autoLength: number;
  legs: LegCheck[] | null;
  onSeek: (t: number) => void;
}) {
  const t = useT();
  const bar = useRef<HTMLDivElement>(null);
  const pct = (v: number) => `${(100 * v) / span}%`;
  const seek = (clientX: number) => {
    const r = bar.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return;
    onSeek(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * span);
  };
  const ticks = [];
  for (let s = 0; s <= span + 1e-9; s += 5) ticks.push(s);
  return (
    <div className="auto-timeline">
      <div
        ref={bar}
        className="tl-bar"
        role="slider"
        tabIndex={0}
        aria-label={t("Zaman")}
        aria-valuemin={0}
        aria-valuemax={Number(span.toFixed(1))}
        aria-valuenow={Number(time.toFixed(1))}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seek(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) seek(e.clientX);
        }}
      >
        {plan.steps.map((s, i) => {
          if (s.kind === "tip")
            return (
              <span
                key={i}
                className="tl-tip"
                style={{ left: pct(s.t0) }}
                title={`${t("HIVE devriliyor")} · ${s.t0.toFixed(1)} s`}
              >
                +20
              </span>
            );
          const leg = legs?.find((l) => l.step === i);
          return (
            <span
              key={i}
              className={`tl-step ${s.kind} ${s.t0 >= autoLength ? "late" : ""} ${leg && !legOk(leg) ? "bad" : ""}`}
              style={{ left: pct(s.t0), width: pct(s.t1 - s.t0) }}
              title={`${s.t0.toFixed(1)}–${s.t1.toFixed(1)} s · ${stepText(s, t)}`}
            />
          );
        })}
        <span
          className="tl-limit"
          style={{ left: pct(autoLength) }}
          title={t.f("Otonom sonu: {t} s", { t: autoLength })}
        />
        <span className="tl-head" style={{ left: pct(Math.min(time, span)) }} />
      </div>
      <div className="tl-ticks">
        {ticks.map((s) => (
          <span key={s} style={{ left: pct(s) }}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
