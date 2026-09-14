import { useState } from "react";
import { useStore } from "../state/store";
import { NumberInput as N, Select, Section, Toggle } from "./Inputs";
import { aim } from "../physics/flight";
import type { Shot, WheelConfig } from "../physics/types";
import { toDeg, toRPM } from "../utils/units";
import { wheelInertia } from "../physics/shooter";
import { getPath, parseConfig } from "../utils/config";
export function RobotControls() {
  const s = useStore();
  return (
    <Section title="Robot pose" open>
      <div className="two-col">
        <N
          label="Position X"
          path="robot.x"
          kind="length"
          min={-s.config.field.size / 2}
          max={s.config.field.size / 2}
          slider={false}
        />
        <N
          label="Position Y"
          path="robot.y"
          kind="length"
          min={-s.config.field.size / 2}
          max={s.config.field.size / 2}
          slider={false}
        />
      </div>
      <N
        label="Chassis heading"
        path="robot.heading"
        kind="angle"
        min={-Math.PI}
        max={Math.PI}
      />
      <N
        label="Turret yaw"
        path="robot.turretYaw"
        kind="angle"
        min={-Math.PI}
        max={Math.PI}
      />
      <button
        className="wide secondary"
        onClick={() => s.setConfig(aim(s.config))}
      >
        ↗ Aim at HIVE
      </button>
      <div className="two-col">
        <Toggle
          label="Auto aim"
          checked={s.autoAim}
          onChange={(autoAim) => s.set({ autoAim })}
        />
        <Toggle
          label="Drive · WASD / Q E"
          checked={s.drive}
          onChange={(drive) => s.set({ drive })}
        />
      </div>
      <label className="select-control">
        Position snap
        <select
          value={s.snap}
          onChange={(e) => s.set({ snap: Number(e.target.value) })}
        >
          <option value={0}>Free movement</option>
          <option value={0.05}>50 mm</option>
          <option value={0.1}>100 mm</option>
          <option value={0.6096}>Tile grid · 24 in</option>
        </select>
      </label>
      <div className="button-row">
        {[
          [-1.2, -1.2],
          [1.2, -1.2],
          [1.2, 1.2],
        ].map(([x, y], i) => (
          <button
            key={i}
            onClick={() => {
              const c = structuredClone(s.config);
              c.robot.x = x;
              c.robot.y = y;
              s.setConfig(aim(c));
            }}
          >
            Pose {i + 1}
          </button>
        ))}
      </div>
    </Section>
  );
}
function Wheel({ path, title }: { path: string; title: string }) {
  const c = useStore((s) => s.config),
    edit = useStore((s) => s.edit),
    w = getPath(c, path) as WheelConfig;
  return (
    <Section title={title}>
      <N
        label={`${title} diameter`}
        path={`${path}.diameter`}
        kind="diameter"
        min={0.005}
        max={0.3}
      />
      <Select
        label="Inertia source"
        path={`${path}.inertiaMode`}
        options={[
          ["unknown", "Unknown — enter measurement"],
          ["disk", "Calculate as solid disk"],
          ["custom", "Measured / custom MOI"],
        ]}
      />
      {w.inertiaMode === "disk" && (
        <N
          label="Measured mass"
          value={w.mass ?? 0}
          onChange={(v) => edit(`${path}.mass`, v)}
          kind="mass"
          min={0}
          max={5}
        />
      )}{" "}
      {w.inertiaMode === "custom" && (
        <N
          label="Wheel inertia"
          value={w.inertia ?? 0}
          onChange={(v) => edit(`${path}.inertia`, v)}
          min={0}
          max={0.02}
          step={0.000001}
          unit="kg·m²"
          slider={false}
        />
      )}
      <p className="muted">
        I = {wheelInertia(w)?.toExponential(4) ?? "unknown"} kg·m²
      </p>
    </Section>
  );
}
export function ShooterControls({ shot }: { shot: Shot }) {
  const s = useStore(),
    c = s.config;
  return (
    <>
      <div className="control-heading">
        <span>SHOOTER SETTINGS</span>
        <span className="tiny-dot" />
      </div>
      <Select
        label="Shooter model"
        path="shooter.mode"
        options={[
          ["physical", "Physical Contact Model"],
          ["recalc", "ReCalc-Calibrated Model"],
        ]}
      />
      <N
        label="96 mm goBILDA Rhino RPM"
        path="shooter.primary.omega"
        kind="rpm"
        max={c.simulation.maxOmega}
        step={(2 * Math.PI) / 60}
      />
      <div className="inline-metric">
        <span>Surface velocity</span>
        <strong>
          {shot.shooter.surfaceSpeeds[0].toFixed(2)} <small>m/s</small>
        </strong>
      </div>
      <Select
        label="Wheel coupling"
        path="shooter.link"
        options={[
          ["surface", "Lock surface speed ratio"],
          ["gear", "Gear ratio linked"],
          ["independent", "Independent RPM"],
        ]}
      />
      {c.shooter.link === "independent" ? (
        <N
          label="Secondary / hood roller"
          path="shooter.secondary.omega"
          kind="rpm"
          max={2500}
        />
      ) : (
        <>
          <N
            label={
              c.shooter.link === "surface"
                ? "Surface speed ratio"
                : "Hood / main RPM ratio"
            }
            path={
              c.shooter.link === "surface"
                ? "shooter.surfaceRatio"
                : "shooter.secondary.ratio"
            }
            min={0}
            max={10}
            unit=":1"
          />
          <div className="inline-metric">
            <span>Hood wheel RPM / surface speed</span>
            <strong>
              {toRPM(
                shot.shooter.surfaceSpeeds[1] /
                  (c.shooter.secondary.diameter / 2),
              ).toFixed(0)}{" "}
              <small>RPM</small> · {shot.shooter.surfaceSpeeds[1].toFixed(2)}{" "}
              <small>m/s</small>
            </strong>
          </div>
        </>
      )}
      <div className="separator" />
      <N
        label={
          c.shooter.hoodOffset === 0
            ? "Hood launch angle"
            : "Mechanical hood setting"
        }
        path="shooter.hoodAngle"
        kind="angle"
        min={c.shooter.hoodMin}
        max={c.shooter.hoodMax}
        tip="Angle above field horizontal; mechanical offset is added below."
      />
      <div className="two-col">
        <N
          label="Minimum hood"
          path="shooter.hoodMin"
          kind="angle"
          max={Math.PI / 2}
        />
        <N
          label="Maximum hood"
          path="shooter.hoodMax"
          kind="angle"
          max={Math.PI / 2}
        />
      </div>
      <p className="muted">
        0° horizontal · 90° upward. Launch tangent:{" "}
        {toDeg(c.shooter.hoodAngle + c.shooter.hoodOffset).toFixed(1)}°
      </p>
      <N
        label="Exit height"
        path="robot.exitOffset.2"
        kind="diameter"
        min={0.05}
        max={2}
      />
      <RobotControls />
      <Section title="Exit & hood geometry">
        <N
          label="Exit X offset"
          path="robot.exitOffset.0"
          kind="diameter"
          min={-0.5}
          max={0.5}
        />
        <N
          label="Exit Y offset"
          path="robot.exitOffset.1"
          kind="diameter"
          min={-0.5}
          max={0.5}
        />
        {[0, 1, 2].map((i) => (
          <N
            key={i}
            label={`Turret center ${"XYZ"[i]}`}
            path={`robot.turretCenter.${i}`}
            kind="diameter"
            min={-0.5}
            max={0.5}
          />
        ))}
        <N
          label="Mechanical-to-launch offset"
          path="shooter.hoodOffset"
          kind="angle"
          min={-Math.PI / 2}
          max={Math.PI / 2}
        />
        <N
          label="Hood radius"
          path="shooter.hoodRadius"
          kind="diameter"
          min={0.03}
          max={0.3}
        />
        <N
          label="Contact arc start"
          path="shooter.hoodStart"
          kind="angle"
          min={-Math.PI}
          max={Math.PI}
        />
        <N
          label="Contact arc end"
          path="shooter.hoodEnd"
          kind="angle"
          min={-Math.PI}
          max={Math.PI}
        />
      </Section>
      <Section title="Compression & contact">
        <p className="muted">
          Powered hood: 3 × AndyMark 1 in Sushi wheels. All are mechanically
          linked to the main wheel at the editable hood/main RPM ratio.
        </p>
        <Select
          label="Mechanism"
          path="shooter.topology"
          options={[
            ["passive", "Primary + passive hood"],
            ["powered", "Primary + powered hood"],
            ["opposing", "Opposing wheels"],
            ["compound", "Compound shooter"],
          ]}
        />
        <N
          label="Compression"
          path="shooter.compression"
          kind="diameter"
          max={0.03}
          step={0.0001}
        />
        <p className="muted">
          Gap = diameter − compression ={" "}
          {((c.projectile.diameter - c.shooter.compression) * 1000).toFixed(2)}{" "}
          mm · compression {(c.shooter.compression / 0.0254).toFixed(3)} in
        </p>
        <N label="Friction coefficient" path="shooter.friction" max={2} />
        <Select
          label="Normal force model"
          path="shooter.normalModel"
          options={[
            ["linear", "Effective series springs"],
            ["table", "Measured force curve"],
          ]}
        />
        <N
          label="Ball stiffness"
          path="shooter.ballStiffness"
          min={10}
          max={50000}
          unit="N/m"
        />
        <N
          label="Wheel stiffness"
          path="shooter.wheelStiffness"
          min={10}
          max={50000}
          unit="N/m"
        />
        <N label="Hysteresis fraction" path="shooter.hysteresis" max={0.9} />
        <ForceTable />
        <N
          label="ReCalc transfer calibration"
          path="shooter.transfer"
          min={0.1}
          max={2}
          unit="×"
        />
        <button
          className="wide"
          onClick={() =>
            s.edit("shooter.rollers", [
              ...c.shooter.rollers,
              structuredClone(c.shooter.secondary),
            ])
          }
        >
          + Add powered hood roller
        </button>
        {c.shooter.rollers.map((_, i) => (
          <div key={i}>
            <Wheel
              path={`shooter.rollers.${i}`}
              title={`Sushi hood wheel ${i + 2}`}
            />
            {c.shooter.link === "independent" && (
              <N
                label={`Roller ${i + 2} speed`}
                path={`shooter.rollers.${i}.omega`}
                kind="rpm"
                max={10000}
              />
            )}
            <button
              onClick={() =>
                s.edit(
                  "shooter.rollers",
                  c.shooter.rollers.filter((_, j) => i !== j),
                )
              }
            >
              Remove roller {i + 2}
            </button>
          </div>
        ))}
      </Section>
      <Wheel path="shooter.primary" title="96 mm goBILDA Rhino" />
      <Wheel path="shooter.secondary" title="Sushi hood wheel 1" />
      <Section title="Motor & flywheel">
        <p className="muted">
          {c.shooter.motor.name}. Electrical constants are editable estimates
          unless measured.
        </p>
        {(
          [
            "voltage",
            "batteryResistance",
            "statorLimit",
            "supplyLimit",
            "efficiency",
            "reduction",
            "kV",
            "kA",
            "kP",
            "resistance",
            "torqueConstant",
          ] as const
        ).map((key, i) => (
          <N
            key={key}
            label={key}
            path={`shooter.motor.${key}`}
            min={0.00001}
            max={[24, 0.5, 200, 100, 1, 20, 1, 1, 2, 10, 1][i]}
            unit={
              [
                "V",
                "Ω",
                "A",
                "A",
                "×",
                ":1",
                "V·s/rad",
                "V·s²/rad",
                "V·s/rad",
                "Ω",
                "N·m/A",
              ][i]
            }
            slider={false}
            step={0.0001}
          />
        ))}
        <Toggle
          label="Flywheel enabled"
          checked={c.shooter.flywheelEnabled}
          onChange={(v) => s.edit("shooter.flywheelEnabled", v)}
        />
        <Wheel path="shooter.flywheel" title="Flywheel" />
        <N
          label="Flywheel speed ratio"
          path="shooter.flywheel.ratio"
          min={0.1}
          max={10}
          unit=":1"
        />
      </Section>
    </>
  );
}
function ForceTable() {
  const c = useStore((s) => s.config),
    edit = useStore((s) => s.edit);
  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Compression mm</th>
            <th>Force N</th>
          </tr>
        </thead>
        <tbody>
          {c.shooter.forceCurve.map((pair, i) => (
            <tr key={i}>
              {pair.map((v, j) => (
                <td key={j}>
                  <input
                    aria-label={`Force curve row ${i + 1} ${j === 0 ? "compression mm" : "force N"}`}
                    type="number"
                    min={0}
                    value={v * (j === 0 ? 1000 : 1)}
                    onChange={(e) => {
                      if (Number.isFinite(e.target.valueAsNumber))
                        edit(
                          `shooter.forceCurve.${i}.${j}`,
                          Math.max(0, e.target.valueAsNumber) /
                            (j === 0 ? 1000 : 1),
                        );
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Piecewise linear interpolation; endpoint force held outside measured
        range.
      </p>
    </>
  );
}
export function PhysicsControls() {
  const s = useStore(),
    c = s.config;
  return (
    <>
      <Section title="POLLEN projectile" open>
        <p className="muted">
          Nominal POLLEN is 2.8 in / 71.12 mm and 25 g. Diameter remains
          editable for real-game-piece variation.
        </p>
        <Select
          label="Projectile model"
          path="projectile.model"
          options={[
            ["sphere", "Simple sphere"],
            ["calibrated", "Calibrated POLLEN"],
          ]}
        />
        <N
          label="Ball diameter"
          path="projectile.diameter"
          kind="diameter"
          min={0.01}
          max={0.15}
        />
        <N
          label="Ball mass"
          path="projectile.mass"
          kind="mass"
          min={0.001}
          max={0.2}
        />
        <N
          label="Initial feed velocity"
          path="projectile.initialVelocity"
          max={4}
          unit="m/s"
        />
        <N
          label="Initial feed spin"
          path="projectile.spin"
          kind="rpm"
          min={-500}
          max={500}
        />
        <Toggle
          label="Use custom ball inertia"
          checked={c.projectile.inertia !== null}
          onChange={(v) =>
            s.edit(
              "projectile.inertia",
              v
                ? 0.4 * c.projectile.mass * (c.projectile.diameter / 2) ** 2
                : null,
            )
          }
        />
        {c.projectile.inertia !== null && (
          <N
            label="Ball inertia"
            path="projectile.inertia"
            min={1e-8}
            max={0.001}
            unit="kg·m²"
            step={0.000001}
            slider={false}
          />
        )}
        <N
          label="Empirical roughness multiplier"
          path="projectile.roughness"
          min={0.1}
          max={3}
          unit="×"
        />
      </Section>
      <Section title="Aerodynamics" open>
        <N label="Drag coefficient Cd" path="aero.cd" max={2} />
        <Toggle
          label="Magnus lift enabled"
          checked={c.aero.magnus}
          onChange={(v) => s.edit("aero.magnus", v)}
        />
        <N label="Lift slope Cl / S" path="aero.liftSlope" max={3} />
        <N label="Maximum Cl" path="aero.liftMax" max={2} />
        <N label="Spin decay" path="aero.spinDecay" max={5} unit="s⁻¹" />
      </Section>
      <Section title="Environment">
        <N
          label="Air density"
          path="environment.density"
          max={2}
          unit="kg/m³"
        />
        <N
          label="Temperature"
          path="environment.temperature"
          min={230}
          max={330}
          unit="K"
        />
        <N
          label="Pressure"
          path="environment.pressure"
          min={50000}
          max={110000}
          unit="Pa"
        />
        <N label="Altitude" path="environment.altitude" max={5000} unit="m" />
        <button
          onClick={() =>
            s.edit(
              "environment.density",
              (c.environment.pressure *
                Math.exp(
                  (-c.environment.gravity * c.environment.altitude) /
                    (287.05 * c.environment.temperature),
                )) /
                (287.05 * c.environment.temperature),
            )
          }
        >
          Derive ρ from sea-level pressure + altitude
        </button>
        {[0, 1, 2].map((i) => (
          <N
            key={i}
            label={`Wind ${"XYZ"[i]}`}
            path={`environment.wind.${i}`}
            min={-10}
            max={10}
            unit="m/s"
          />
        ))}
        <N
          label="Gravity"
          path="environment.gravity"
          min={0.1}
          max={20}
          unit="m/s²"
        />
      </Section>
      <Section title="Shoot on the move">
        <Toggle
          label="Add chassis velocity to launch"
          checked={c.robot.inheritVelocity}
          onChange={(v) => s.edit("robot.inheritVelocity", v)}
        />
        {[0, 1, 2].map((i) => (
          <N
            key={i}
            label={`Robot velocity ${"XYZ"[i]}`}
            path={`robot.velocity.${i}`}
            min={-4}
            max={4}
            unit="m/s"
          />
        ))}
      </Section>
      <Section title="Numerical integration">
        <N
          label="Absolute tolerance"
          path="simulation.absTolerance"
          min={1e-10}
          max={0.0005}
          unit="SI"
          step={1e-8}
          slider={false}
        />
        <N
          label="Relative tolerance"
          path="simulation.relTolerance"
          min={1e-10}
          max={0.0001}
          step={1e-7}
          slider={false}
        />
        <N
          label="Maximum flight step"
          path="simulation.maxStep"
          min={0.0001}
          max={0.02}
          step={0.0001}
          unit="s"
        />
        <N
          label="Maximum flight time"
          path="simulation.maxTime"
          min={0.1}
          max={15}
          unit="s"
        />
        <N
          label="Contact time step"
          path="shooter.contactStep"
          min={0.00001}
          max={0.001}
          step={0.00001}
          unit="s"
          slider={false}
        />
        <p className="muted">
          Numerical tolerance ≠ experimental accuracy. RK45 steps are
          independent of rendering.
        </p>
      </Section>
    </>
  );
}
export function FieldControls() {
  const s = useStore(),
    c = s.config;
  return (
    <>
      <div className="notice">
        Competition HIVE is centered on the FIELD in the published deployed 30°
        position. The blue upward CELL is the active scoring volume; its
        pentagonal opening is used for entry checks. No tipping / retention
        model.
      </div>
      <Section title="Field & scoring volume" open>
        <N
          label="Field side length"
          path="field.size"
          min={1}
          max={10}
          unit="m"
        />
        <N
          label="Perimeter height"
          path="field.wallHeight"
          min={0.01}
          max={1}
          unit="m"
        />
        {[0, 1, 2].map((i) => (
          <N
            key={i}
            label={`Target center ${"XYZ"[i]}`}
            path={`field.target.center.${i}`}
            min={i === 2 ? 0.1 : -3}
            max={3}
            unit="m"
          />
        ))}
        <N
          label="Opening width"
          path="field.target.width"
          min={0.05}
          max={2}
          kind="diameter"
        />
        <N
          label="Opening height"
          path="field.target.height"
          min={0.05}
          max={2}
          kind="diameter"
        />
        <N
          label="Cell depth"
          path="field.target.depth"
          min={0.02}
          max={1}
          kind="diameter"
        />
        <N
          label="Opening yaw"
          path="field.target.yaw"
          min={-Math.PI}
          max={Math.PI}
          kind="angle"
        />
        <N
          label="Opening-normal tilt from upward"
          path="field.target.tilt"
          min={-Math.PI}
          max={Math.PI}
          kind="angle"
        />
        <p className="muted">{c.field.target.provenance}</p>
        <p className="muted">{c.field.hive.provenance}</p>
        <a
          href="https://ftc-resources.firstinspires.org/ftc/game/manual-09"
          target="_blank"
          rel="noreferrer"
        >
          FIRST · official arena manual ↗
        </a>
      </Section>
      <Section title="Debug overlays" open>
        <label className="select-control">
          Trajectory color
          <select
            aria-label="Trajectory color"
            value={s.trajectoryColor}
            onChange={(e) =>
              s.set({
                trajectoryColor: e.target.value as typeof s.trajectoryColor,
              })
            }
          >
            <option value="status">Entry status</option>
            <option value="speed">Speed · cool to warm</option>
            <option value="time">Flight time · cool to warm</option>
            <option value="vertical">
              Vertical velocity · descending to rising
            </option>
          </select>
        </label>
        {Object.entries(s.overlays).map(([key, v]) => (
          <Toggle
            key={key}
            label={key}
            checked={v}
            onChange={(value) =>
              s.set({ overlays: { ...s.overlays, [key]: value } })
            }
          />
        ))}
      </Section>
      <Section title="Field CAD">
        <p className="muted">
          Import a self-contained GLB, in meters, Z-up. CAD is a visual
          reference; collision geometry stays explicit in the profile.
        </p>
        <input
          aria-label="Import field GLB"
          type="file"
          accept=".glb"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              if (s.cadURL) URL.revokeObjectURL(s.cadURL);
              s.set({ cadURL: URL.createObjectURL(file) });
            }
          }}
        />
        {s.cadURL && (
          <button
            onClick={() => {
              URL.revokeObjectURL(s.cadURL!);
              s.set({ cadURL: null });
            }}
          >
            Remove CAD
          </button>
        )}
      </Section>
      <ProfileEditor />
    </>
  );
}
export function ProfileEditor() {
  const s = useStore(),
    [value, setValue] = useState(""),
    [error, setError] = useState("");
  return (
    <Section title="Advanced profile JSON">
      <button onClick={() => setValue(JSON.stringify(s.config, null, 2))}>
        Read current configuration
      </button>
      <textarea
        aria-label="Advanced profile JSON"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={16}
      />
      <button
        onClick={async () => {
          try {
            s.setConfig(parseConfig(JSON.parse(value)));
            setError("Configuration applied.");
          } catch (e) {
            setError(String(e));
          }
        }}
      >
        Validate & apply JSON
      </button>
      <p className="muted">{error}</p>
    </Section>
  );
}
