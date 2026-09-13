import { useState, useEffect, useRef } from "react";
import type { Shot } from "../physics/types";
import { toRPM, toDeg } from "../utils/units";
import { norm } from "../physics/math";
import { aerodynamicForces } from "../physics/aerodynamics";
import { ballInertia } from "../physics/shooter";
export function Telemetry({ shot }: { shot: Shot }) {
  const [chart, setChart] = useState("Trajectory"),
    [hover, setHover] = useState<number | null>(null);
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
  const xmin = 0,
    xmax = Math.max(0.01, ...data.map((d) => d.x)),
    ymin = Math.min(0, ...data.map((d) => d.y)),
    ymax = Math.max(0.1, ...data.map((d) => d.y));
  const point = (d: (typeof data)[number]) =>
    `${40 + (540 * (d.x - xmin)) / (xmax - xmin)},${126 - (100 * (d.y - ymin)) / (ymax - ymin)}`;
  const h =
    hover === null
      ? null
      : data[Math.min(data.length - 1, Math.round(hover * (data.length - 1)))];
  return (
    <div className="telemetry">
      <div className="telemetry-title">
        <span>FLIGHT TELEMETRY</span>
        <select
          aria-label="Telemetry chart"
          value={chart}
          onChange={(e) => setChart(e.target.value)}
        >
          {[
            "Trajectory",
            "Speed",
            "Vertical velocity",
            "Spin",
            "Drag acceleration",
            "Magnus acceleration",
            "Energy",
          ].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <span className="muted">
          {chart === "Trajectory"
            ? "range m / height m"
            : "time s / " +
              ({
                Speed: "m/s",
                "Vertical velocity": "m/s",
                Spin: "RPM",
                "Drag acceleration": "m/s²",
                "Magnus acceleration": "m/s²",
                Energy: "J",
              }[chart] ?? "")}
        </span>
      </div>
      <svg
        viewBox="0 0 610 155"
        role="img"
        aria-label={`${chart} graph`}
        onMouseMove={(e) =>
          setHover(
            (e.clientX - e.currentTarget.getBoundingClientRect().left) /
              e.currentTarget.getBoundingClientRect().width,
          )
        }
        onMouseLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line
              x1="40"
              x2="580"
              y1={126 - v * 100}
              y2={126 - v * 100}
              stroke="#344047"
              strokeDasharray="3 4"
            />
            <text x="3" y={130 - v * 100}>
              {(ymin + v * (ymax - ymin)).toFixed(1)}
            </text>
          </g>
        ))}
        <polyline
          points={data.map(point).join(" ")}
          fill="none"
          stroke="#e1bd7d"
          strokeWidth="2.2"
        />
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <text key={v} x={40 + 540 * v} y="148">
            {(xmax * v).toFixed(2)}
          </text>
        ))}
        {h && (
          <>
            <circle
              cx={point(h).split(",")[0]}
              cy={point(h).split(",")[1]}
              r="4"
              fill="#f5e7c8"
            />
            <text x="250" y="15">
              t {h.t.toFixed(3)} s · value {h.y.toFixed(3)}
            </text>
          </>
        )}
      </svg>
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
      <div className="telemetry-title">
        <span>SHOOTER SECTION · SCHEMATIC</span>
        <button onClick={() => setAnimate(!animate)}>
          {animate ? "Pause" : "Animate contact"}
        </button>
      </div>
      <svg viewBox="0 0 360 220">
        <circle
          cx="160"
          cy="120"
          r={radius * scale}
          fill="#343e43"
          stroke="#efc57f"
          strokeWidth="3"
        />
        <polyline points={arc} fill="none" stroke="#9facad" strokeWidth="6" />
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
          fill="#e1bd78"
          fillOpacity=".4"
          stroke="#ebcc8c"
        />
        <line
          x1="160"
          y1="120"
          x2="310"
          y2="120"
          stroke="#60747b"
          strokeDasharray="4 4"
        />
        <text x="255" y="137">
          0° horizontal
        </text>
        <text x="12" y="20">
          Ø {(c.shooter.primary.diameter * 1000).toFixed(0)} mm /{" "}
          {(c.shooter.secondary.diameter * 1000).toFixed(0)} mm
        </text>
        <text x="12" y="207">
          compression {(c.shooter.compression * 1000).toFixed(1)} mm
        </text>
      </svg>
      {row && (
        <p className="mono">
          N {row.normal.toFixed(1)} N · Ft {row.force.toFixed(1)} N · slip{" "}
          {row.slip.toFixed(3)} m/s
          <br />v {row.velocity.toFixed(2)} m/s · spin{" "}
          {toRPM(row.spin).toFixed(0)} RPM
        </p>
      )}
      <p className="muted">
        Lumped simultaneous contact model; this schematic does not assert
        sequential roller engagement.
      </p>
    </div>
  );
}
