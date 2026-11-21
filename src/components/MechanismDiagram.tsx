// Live side-view schematic of the robot setup. Drawn to scale from the spec
// (wheel, POLLEN, gap, hood contacts / top wheel, launch angle); a teaching
// picture, not the simulation's contact geometry.
import {
  POLLEN_DIAMETER,
  type Mechanism,
  type RobotSpec,
} from "../presets/factory";
import { useT } from "../i18n/useT";

const MM = 1000;

export function MechanismDiagram({
  spec,
  highlight,
}: {
  spec: RobotSpec;
  highlight?: "wheel" | "second" | "gap" | "angle" | "mechanism";
}) {
  const R = (spec.wheelDiameter * MM) / 2;
  const b = (POLLEN_DIAMETER * MM) / 2;
  const gap = Math.max(1, spec.gap * MM);
  const squeeze = Math.max(0, POLLEN_DIAMETER * MM - gap);
  const twin = spec.mechanism === "twin-wheel";
  const fixed = spec.mechanism === "wheel-fixed-hood";
  const a = (spec.hoodAngleDeg * Math.PI) / 180;
  // Ball sits on top of the main wheel (centre at the origin), pressed by `squeeze`.
  const ballY = -(R + b - squeeze / 2);
  const top = (spec.topWheelDiameter * MM) / 2;
  const r = (spec.rollerDiameter * MM) / 2;
  const n = Math.max(1, Math.min(4, Math.round(spec.hoodRollers) || 1));
  const hoodR = R + gap; // hood surface radius around the main wheel
  // Hood contacts wrap the wheel up to the ball, which leaves at the top.
  const end = -Math.PI / 2;
  const span = Math.min(1.4, 0.35 * n);
  const rollers = Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? end : end - span + (span * i) / (n - 1);
    return [(hoodR + r) * Math.cos(t), (hoodR + r) * Math.sin(t)] as const;
  });
  const exit = [Math.cos(-a), Math.sin(-a)] as const;
  const ext = Math.max(R, 60) + 90;
  const pad = 30;
  const minX = -R - pad - 20;
  const maxX = Math.max(R, b) + ext * 0.75;
  const minY = ballY - b - (twin ? 2 * top : 2 * r + 10) - pad - 20;
  const maxY = R + pad + 26;
  const hl = (k: string) => (highlight === k ? "hl" : "");
  const surface = (Math.PI * spec.wheelDiameter * spec.wheelRPM) / 60;
  const t = useT();
  return (
    <svg
      className="mechanism-diagram"
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      role="img"
      aria-label={t("Shooter yan görünüm şeması")}
    >
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" className="arrow-head" />
        </marker>
      </defs>
      {/* Main wheel */}
      <g className={`wheel main ${hl("wheel")}`}>
        <circle r={R} />
        <circle r={Math.min(6, R / 4)} className="hub" />
        <path
          d={`M ${R * 0.62} ${-R * 0.62} A ${R * 0.88} ${R * 0.88} 0 0 0 ${-R * 0.62} ${-R * 0.62}`}
          markerEnd="url(#arrow)"
          className="spin"
          transform="scale(-1,1)"
        />
        <text y={R + 16} textAnchor="middle">
          ⌀ {(spec.wheelDiameter * MM).toFixed(0)} mm ·{" "}
          {spec.wheelRPM.toFixed(0)} RPM
        </text>
      </g>
      {/* Opposite surface */}
      {twin ? (
        <g className={`wheel second ${hl("second")}`}>
          <circle cy={ballY - b - top + squeeze / 2} r={top} />
          <circle
            cy={ballY - b - top + squeeze / 2}
            r={Math.min(6, top / 4)}
            className="hub"
          />
          <text
            x={top + 8}
            y={ballY - b - top + squeeze / 2}
            dominantBaseline="middle"
          >
            ⌀ {(spec.topWheelDiameter * MM).toFixed(0)} mm
          </text>
        </g>
      ) : (
        <g className={`hood ${fixed ? "fixed" : ""} ${hl("second")}`}>
          <path
            d={`M ${hoodR * Math.cos(end - span - 0.35)} ${hoodR * Math.sin(end - span - 0.35)} A ${hoodR} ${hoodR} 0 0 1 ${hoodR * Math.cos(end + 0.12)} ${hoodR * Math.sin(end + 0.12)}`}
            className="hood-line"
          />
          {rollers.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={r} className="roller" />
          ))}
        </g>
      )}
      {/* POLLEN */}
      <g className={`pollen ${hl("gap")}`}>
        <circle cy={ballY} r={b} />
        <text cy={ballY} y={ballY + 4} textAnchor="middle">
          POLLEN
        </text>
      </g>
      {/* Launch direction */}
      <g className={`launch ${hl("angle")}`}>
        <line
          x1={0}
          y1={ballY}
          x2={exit[0] * ext}
          y2={ballY + exit[1] * ext}
          markerEnd="url(#arrow)"
        />
        <line x1={0} y1={ballY} x2={ext * 0.55} y2={ballY} className="ref" />
        <path
          d={`M ${ext * 0.4} ${ballY} A ${ext * 0.4} ${ext * 0.4} 0 0 0 ${ext * 0.4 * Math.cos(a)} ${ballY - ext * 0.4 * Math.sin(a)}`}
          className="ref"
        />
        <text x={ext * 0.46} y={ballY - 8}>
          {spec.hoodAngleDeg.toFixed(0)}°
        </text>
      </g>
      <text className="caption" x={minX + 8} y={maxY - 8}>
        {t.f("Yüzey hızı {s} m/s · boşluk {g} mm · sıkışma {q} mm", {
          s: surface.toFixed(2),
          g: gap.toFixed(0),
          q: squeeze.toFixed(1),
        })}
      </text>
    </svg>
  );
}

/** Small icon-sized schematic for mechanism choice cards. */
export function MechanismIcon({ mechanism }: { mechanism: Mechanism }) {
  return (
    <svg
      className="mechanism-icon"
      viewBox="-62 -102 124 134"
      aria-hidden="true"
    >
      <circle r="28" className="w" />
      <circle cy="-40" r="13" className="p" />
      {mechanism === "twin-wheel" ? (
        <circle cy="-75" r="24" className="w" transform="translate(0 4)" />
      ) : (
        <>
          <path d="M -46 -30 A 54 54 0 0 1 30 -48" className="h" />
          {mechanism === "wheel-driven-hood" &&
            [-34, -12, 12].map((x, i) => (
              <circle
                key={i}
                cx={x}
                cy={-58 + Math.abs(x) * 0.2}
                r="6"
                className="r"
              />
            ))}
        </>
      )}
      <path d="M 6 -44 L 52 -64" className="a" />
    </svg>
  );
}
