import { useState, useEffect, useRef } from "react";
import { Pause, Play } from "lucide-react";
import type { Shot } from "../physics/types";
import { toRPM, toDeg } from "../utils/units";
import { norm } from "../physics/math";
import { aerodynamicForces } from "../physics/aerodynamics";
import { ballInertia } from "../physics/shooter";
const charts: Record<string, [string, string]> = {
  Trajectory: ["Height", "m"],
  Speed: ["Speed", "m/s"],
  "Vertical velocity": ["Vertical velocity", "m/s"],
  Spin: ["Spin", "RPM"],
  "Drag acceleration": ["Drag acceleration", "m/s²"],
  "Magnus acceleration": ["Magnus acceleration", "m/s²"],
  Energy: ["Projectile energy", "J"],
};
/** Round-number axis ticks covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 5) {
  const span = hi - lo || 1,
    raw = span / Math.max(1, count - 1),
    mag = 10 ** Math.floor(Math.log10(raw)),
    step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag,
    first = Math.floor(lo / step + 1e-9),
    last = Math.ceil(hi / step - 1e-9),
    ticks: number[] = [];
  for (let i = first; i <= last; i++)
    ticks.push(Number((i * step).toPrecision(12)));
  return { ticks, step };
}
const tickText = (v: number, step: number) =>
  v.toFixed(Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
/** Track an element's content size so charts draw in real pixels. */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null),
    [size, setSize] = useState({ width: 600, height: 160 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setSize({
        width: Math.max(200, e.contentRect.width),
        height: Math.max(100, e.contentRect.height),
      }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}
export function Telemetry({ shot }: { shot: Shot }) {
  const [chart, setChart] = useState("Trajectory"),
    [hover, setHover] = useState<number | null>(null),
    [box, size] = useSize<HTMLDivElement>();
  const f = shot.flight,
    c = shot.config;
  const data = f.samples.map((p) => {
    const forces = aerodynamicForces(p.v, p.spin, c);
    const y =
      chart === "Trajectory"
        ? p.p[2]
        : chart === "Speed"
          ? norm(p.v)
          : chart === "Vertical velocity"
            ? p.v[2]
            : chart === "Spin"
              ? toRPM(norm(p.spin))
              : chart === "Drag acceleration"
                ? norm(forces.drag) / c.projectile.mass
                : chart === "Magnus acceleration"
                  ? norm(forces.lift) / c.projectile.mass
                  : 0.5 * c.projectile.mass * norm(p.v) ** 2 +
                    0.5 * ballInertia(c) * norm(p.spin) ** 2;
    return {
      x:
        chart === "Trajectory"
          ? Math.hypot(p.p[0] - shot.origin[0], p.p[1] - shot.origin[1])
          : p.t,
      y,
      t: p.t,
    };
  });
  const [yName, yUnit] = charts[chart],
    xName = chart === "Trajectory" ? "Horizontal range (m)" : "Time (s)";
  const xs = niceTicks(0, Math.max(0.01, ...data.map((d) => d.x)), 7),
    ys = niceTicks(
      Math.min(0, ...data.map((d) => d.y)),
      Math.max(1e-3, ...data.map((d) => d.y)),
      5,
    );
  const xmin = xs.ticks[0],
    xmax = xs.ticks.at(-1)!,
    ymin = ys.ticks[0],
    ymax = ys.ticks.at(-1)!;
  const m = { l: 58, r: 14, t: 10, b: 34 },
    w = size.width - m.l - m.r,
    h = size.height - m.t - m.b;
  const px = (x: number) => m.l + (w * (x - xmin)) / (xmax - xmin || 1),
    py = (y: number) => m.t + h - (h * (y - ymin)) / (ymax - ymin || 1);
  const hp =
    hover === null
      ? null
      : data.reduce((best, d) =>
          Math.abs(px(d.x) - hover) < Math.abs(px(best.x) - hover) ? d : best,
        );
  return (
    <div className="telemetry">
      <div className="panel-toolbar">
        <select
          aria-label="Telemetry chart"
          value={chart}
          onChange={(e) => setChart(e.target.value)}
        >
          {Object.keys(charts).map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <span>
          {yName} ({yUnit}) vs {xName.toLowerCase()} · hover to read values
        </span>
      </div>
      <div className="chart-box" ref={box}>
        <svg
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label={`${chart} graph`}
          onMouseMove={(e) =>
            setHover(e.clientX - e.currentTarget.getBoundingClientRect().left)
          }
          onMouseLeave={() => setHover(null)}
        >
          {ys.ticks.map((v) => (
            <g key={v}>
              <line
                className="chart-grid"
                x1={m.l}
                x2={m.l + w}
                y1={py(v)}
                y2={py(v)}
              />
              <text className="tick" x={m.l - 6} y={py(v) + 4} textAnchor="end">
                {tickText(v, ys.step)}
              </text>
            </g>
          ))}
          {xs.ticks.map((v) => (
            <text
              key={v}
              className="tick"
              x={px(v)}
              y={m.t + h + 15}
              textAnchor="middle"
            >
              {tickText(v, xs.step)}
            </text>
          ))}
          <line
            className="chart-axis"
            x1={m.l}
            x2={m.l + w}
            y1={py(Math.max(ymin, Math.min(ymax, 0)))}
            y2={py(Math.max(ymin, Math.min(ymax, 0)))}
          />
          <line
            className="chart-axis"
            x1={m.l}
            x2={m.l}
            y1={m.t}
            y2={m.t + h}
          />
          <text
            className="axis-title"
            x={m.l + w / 2}
            y={size.height - 3}
            textAnchor="middle"
          >
            {xName}
          </text>
          <text
            className="axis-title"
            transform={`translate(12 ${m.t + h / 2}) rotate(-90)`}
            textAnchor="middle"
          >
            {yName} ({yUnit})
          </text>
          <polyline
            className="chart-line"
            points={data.map((d) => `${px(d.x)},${py(d.y)}`).join(" ")}
          />
          {hp && (
            <>
              <line
                className="chart-cross"
                x1={px(hp.x)}
                x2={px(hp.x)}
                y1={m.t}
                y2={m.t + h}
              />
              <circle className="chart-dot" cx={px(hp.x)} cy={py(hp.y)} r="4" />
            </>
          )}
        </svg>
        {hp && (
          <span className="chart-readout">
            t {hp.t.toFixed(3)} s
            {chart === "Trajectory" ? ` · x ${hp.x.toFixed(3)} m` : ""} ·{" "}
            {yName.toLowerCase()} {hp.y.toFixed(3)} {yUnit}
          </span>
        )}
      </div>
    </div>
  );
}
export function Metrics({ shot }: { shot: Shot }) {
  const s = shot.shooter,
    f = shot.flight;
  const value = (x: number | null | undefined, precision = 3) =>
    x == null ? "—" : x.toFixed(precision);
  const rows: [string, string, string][] = [
    [
      "Launch angle",
      value(
        toDeg(shot.config.shooter.hoodAngle + shot.config.shooter.hoodOffset),
        1,
      ),
      "°",
    ],
    [
      "Primary speed",
      value(toRPM(shot.config.shooter.primary.omega), 0),
      "RPM",
    ],
    ["Primary surface", value(s.surfaceSpeeds[0]), "m/s"],
    ["Secondary surface", value(s.surfaceSpeeds[1]), "m/s"],
    ["Ball spin", value(toRPM(s.spin), 1), "RPM"],
    ["Translational energy", value(s.energy), "J"],
    ["Rotational energy", value(s.rotationalEnergy), "J"],
    ["Total projectile energy", value(s.energy + s.rotationalEnergy), "J"],
    ["Stored wheel energy", value(s.storedEnergy), "J"],
    [
      "Primary speed drop",
      s.storedEnergy === null ? "—" : value(toRPM(s.drop), 0),
      "RPM",
    ],
    [
      "Post-shot primary",
      s.storedEnergy === null ? "—" : value(toRPM(s.postOmega), 0),
      "RPM",
    ],
    ["Spin-up to 98%", value(s.spinup), "s"],
    ["Recovery to 98%", value(s.recovery), "s"],
    ["Flight to impact", value(f.impact?.t), "s"],
    ["Apex height", value(f.apex.p[2]), "m"],
    ["Apex time", value(f.apex.t), "s"],
    ["Apex X / Y", `${value(f.apex.p[0])} / ${value(f.apex.p[1])}`, "m"],
    ["Entry speed", value(f.entry?.speed), "m/s"],
    [
      "Entry downward angle",
      value(f.entry ? toDeg(f.entry.angle) : null, 1),
      "°",
    ],
    [
      "Entry incidence",
      value(f.entry ? toDeg(f.entry.incidence) : null, 1),
      "°",
    ],
    [
      "Entry horizontal speed",
      value(f.entry ? Math.hypot(f.entry.v[0], f.entry.v[1]) : null),
      "m/s",
    ],
    ["Entry vertical speed", value(f.entry?.v[2]), "m/s"],
    ["Target miss distance", value(f.missDistance), "m"],
    [
      "Mechanical transfer efficiency",
      value(s.efficiency === null ? null : s.efficiency * 100, 1),
      "%",
    ],
    ["Slip dissipation", value(s.slipLoss), "J"],
    ["Hysteresis loss estimate", value(s.hysteresisLoss), "J"],
    ["Elastic deformation estimate", value(s.deformationEnergy), "J"],
    ["New battery energy during shot", value(s.electricalEnergy), "J"],
  ];
  return (
    <div className="metric-table">
      {rows.map(([label, v, unit]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>
            {v} <small>{unit}</small>
          </strong>
        </div>
      ))}
      <p className="muted">
        — = unknown, requires inertia / motor measurement. During contact, motor
        input is excluded; stored wheel energy and battery replenishment are
        separate.
      </p>
    </div>
  );
}
export function CrossSection({ shot }: { shot: Shot }) {
  const [animate, setAnimate] = useState(false),
    [time, setTime] = useState(0),
    last = useRef(0);
  useEffect(() => {
    if (!animate) return;
    let handle: number;
    const tick = (now: number) => {
      if (now - last.current > 40) {
        setTime((t) => (t + 0.02) % 1);
        last.current = now;
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [animate]);
  const c = shot.config,
    trace = shot.shooter.trace,
    row = trace[Math.min(trace.length - 1, Math.floor(time * trace.length))];
  const radius = c.shooter.primary.diameter / 2,
    scale = 850,
    arc = Array.from({ length: 40 }, (_, i) => {
      const a =
        c.shooter.hoodStart +
        ((c.shooter.hoodEnd - c.shooter.hoodStart) * i) / 39;
      return `${160 + c.shooter.hoodRadius * scale * Math.cos(a)},${120 - c.shooter.hoodRadius * scale * Math.sin(a)}`;
    }).join(" ");
  const a =
    c.shooter.hoodStart + (c.shooter.hoodEnd - c.shooter.hoodStart) * time;
  return (
    <div className="cross-section">
      <div className="panel-toolbar">
        <span>Side-view schematic of the contact path (not to scale)</span>
        <button className="push" onClick={() => setAnimate(!animate)}>
          {animate ? <Pause size={14} /> : <Play size={14} />}
          {animate ? "Pause" : "Animate contact"}
        </button>
      </div>
      <svg viewBox="0 0 360 220" role="img" aria-label="Shooter section">
        <circle className="wheel" cx="160" cy="120" r={radius * scale} />
        <polyline className="hood" points={arc} />
        <circle
          cx={
            160 +
            (radius + c.projectile.diameter / 2 - c.shooter.compression) *
              scale *
              Math.cos(a)
          }
          cy={
            120 -
            (radius + c.projectile.diameter / 2 - c.shooter.compression) *
              scale *
              Math.sin(a)
          }
          r={(c.projectile.diameter / 2) * scale}
          className="ball"
        />
        <line className="chart-cross" x1="160" y1="120" x2="330" y2="120" />
        <text className="tick" x="250" y="136">
          0° horizontal
        </text>
      </svg>
      <div className="readout">
        <dl>
          <dt>Wheel Ø main / hood</dt>
          <dd>
            {(c.shooter.primary.diameter * 1000).toFixed(0)} /{" "}
            {(c.shooter.secondary.diameter * 1000).toFixed(0)} mm
          </dd>
          <dt>Compression</dt>
          <dd>{(c.shooter.compression * 1000).toFixed(1)} mm</dd>
          {row && (
            <>
              <dt>Contact progress</dt>
              <dd>{(time * 100).toFixed(0)} %</dd>
              <dt>Normal force N</dt>
              <dd>{row.normal.toFixed(1)} N</dd>
              <dt>Tangential force Ft</dt>
              <dd>{row.force.toFixed(1)} N</dd>
              <dt>Slip speed</dt>
              <dd>{row.slip.toFixed(3)} m/s</dd>
              <dt>Ball speed</dt>
              <dd>{row.velocity.toFixed(2)} m/s</dd>
              <dt>Ball spin</dt>
              <dd>{toRPM(row.spin).toFixed(0)} RPM</dd>
            </>
          )}
        </dl>
        <p className="muted">
          Lumped simultaneous contact model; this schematic does not assert
          sequential roller engagement.
        </p>
      </div>
    </div>
  );
}
