import { Section } from "./Inputs";
import {
  legacyDistanceIn,
  legacyExcludedPositions,
  legacyFormulas,
  legacyHood,
  legacyLookupTable,
  legacyRPM,
  legacyShots,
  type LegacyBand,
} from "../data/legacy2025";
/** Read-only view of FTC #25577's 2025-26 (DECODE) measured hits. */
export function LegacyData() {
  const [d0, d1] = legacyFormulas.validDistanceIn;
  const shots = legacyShots.map((s) => ({
    ...s,
    distance: legacyDistanceIn(s.position),
    excluded: legacyExcludedPositions.includes(s.position),
  }));
  const xMin = 30,
    xMax = 160,
    yMin = 3500,
    yMax = 6000;
  const x = (d: number) => 48 + (200 * (d - xMin)) / (xMax - xMin);
  const y = (r: number) => 148 - (135 * (r - yMin)) / (yMax - yMin);
  const line = (band: LegacyBand) =>
    `${x(d0)},${y(legacyRPM(d0, band))} ${x(d1)},${y(legacyRPM(d1, band))}`;
  return (
    <Section title="Last-season reference data (DECODE 2025-26)">
      <p className="notice">
        FTC #25577 Zağanos, DECODE 2025-26: single 4 in flywheel, passive hood,
        5 in ARTIFACT, DECODE GOAL. Not BIOBUZZ and not a simulator prediction.
      </p>
      <svg
        className="legacy-chart"
        viewBox="0 0 260 180"
        aria-label="Legacy RPM versus distance"
      >
        {[3500, 4000, 4500, 5000, 5500, 6000].map((r) => (
          <g key={r}>
            <line className="chart-grid" x1="48" x2="248" y1={y(r)} y2={y(r)} />
            <text className="tick" x="44" y={y(r) + 3} textAnchor="end">
              {r}
            </text>
          </g>
        ))}
        {[40, 80, 120, 160].map((d) => (
          <text key={d} className="tick" x={x(d)} y="161" textAnchor="middle">
            {d}
          </text>
        ))}
        <text className="axis-title" x="148" y="176" textAnchor="middle">
          Robot distance to goal (in)
        </text>
        <text
          className="axis-title"
          transform="translate(10 80) rotate(-90)"
          textAnchor="middle"
        >
          Wheel RPM
        </text>
        {(["min", "max"] as const).map((band) => (
          <polyline key={band} className="chart-dashed" points={line(band)} />
        ))}
        <polyline className="chart-line alt" points={line("mean")} />
        {shots.map((s) => (
          <circle
            key={s.odsRow}
            className={`chart-dot ${s.excluded ? "hollow" : ""}`}
            cx={x(s.distance)}
            cy={y(s.actualRPM)}
            r={2.2}
            opacity={0.85}
          />
        ))}
      </svg>
      <p className="muted">
        Measured wheel RPM of recorded hits against robot-center distance to
        Pedro (0, 144) in (x: in, y: RPM). Hollow: position 2,2, excluded by the
        original analysis. Lines: fitted mean (solid) and min/max (dashed) RPM,{" "}
        {d0}–{d1} in.
      </p>
      <table>
        <thead>
          <tr>
            <th>Distance in</th>
            <th>Hood cmd</th>
            <th>Min RPM</th>
            <th>Max RPM</th>
          </tr>
        </thead>
        <tbody>
          {legacyLookupTable.map(([d, h, lo, hi], i) => (
            <tr key={i}>
              <td>{d.toFixed(1)}</td>
              <td>{h.toFixed(1)}</td>
              <td>{lo}</td>
              <td>{hi}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Fits: RPM = {legacyFormulas.rpm.mean.slope}·d +{" "}
        {legacyFormulas.rpm.mean.intercept}; hood command at 100 in ={" "}
        {legacyHood(100).toFixed(1)}. Hood values are a 25–50 servo command, not
        a launch angle.
      </p>
      <p className="muted">
        Not converted to calibration rows. The rows have no exit speed, spin, or
        timed position. The hood launch angle, exit height, and ARTIFACT mass
        were never measured, and the target was the DECODE GOAL, which is not
        modeled here.
      </p>
    </Section>
  );
}
