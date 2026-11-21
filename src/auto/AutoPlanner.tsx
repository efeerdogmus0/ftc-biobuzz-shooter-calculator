// Oto planlayıcı: the fastest BIOBUZZ auto for a robot from Probot Builder /
// Probot Sim (drivetrain, size) with a shooter from this app's physics.
// Nothing here needs a button press: the shot map, the plan, the coach and
// the 2D physics check all follow the inputs on their own.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardCopy, Eye, MapPin, Sparkles } from "lucide-react";
import { useStore } from "../state/store";
import { useT } from "../i18n/useT";
import { inferSpec } from "../presets/factory";
import { ballModelSettings } from "../physics/launchDynamics";
import { placed } from "../app/shotPoints";
import {
  builderTemplates,
  openBuilderProject,
  readRobotFile,
  robotFromProject,
  sentFromBuilder,
  type ProbotRobot,
  type RobotSource,
} from "./probot";
import {
  fromFootprint,
  manualRobot,
  robotFromProbot,
  type AutoRobot,
} from "./robot";
import {
  pickupSources,
  starts,
  type Alliance,
  type PickupSource,
} from "./field";
import type { Plan, PlanInput, PlanSettings, Step } from "./planner";
import { useShotMaps } from "./useShotMaps";
import { legOk, type Engine, type LegCheck, type Verification } from "./verify";
import { changes, type Advice } from "./coach";
import {
  defaultPlannerState,
  loadPlannerState,
  savePlannerState,
} from "./persist";
import { planText, stepText } from "./planText";
import Stage, { type StageHandle } from "./Stage";

type Picked =
  | { kind: "source"; id: string }
  | { kind: "file"; robot: ProbotRobot; notes: string[] }
  | { kind: "manual" };

const deg = 180 / Math.PI;
const fmt = (v: number, d = 1) => v.toFixed(d);
const COARSE = 0.4;

function sourcesAvailable(): RobotSource[] {
  const list: RobotSource[] = [];
  const sent = sentFromBuilder();
  if (sent) list.push(sent);
  const open = openBuilderProject();
  if (open) list.push(open);
  return [...list, ...builderTemplates];
}

function loadRobot(src: RobotSource) {
  if (src.robot) return src.robot();
  const p = src.proje();
  return p ? robotFromProject(p) : "Proje okunamadı";
}

function Num({
  label,
  value,
  unit,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  step?: number;
  onChange: (v: number) => void;
}) {
  const t = useT();
  return (
    <label className="auto-num">
      <span>{t(label)}</span>
      <input
        type="number"
        step={step}
        value={Number(value.toFixed(3))}
        onChange={(e) => {
          const v = e.target.valueAsNumber;
          if (Number.isFinite(v) && v >= 0) onChange(v);
        }}
      />
      <small>{t(unit)}</small>
    </label>
  );
}

const adviceLabel: Record<string, string> = {
  speed: "Sürüş %25 daha hızlı ({v} m/s)",
  accel: "İvme %50 daha fazla ({v} m/s²)",
  capacity: "Kapasite {v} top",
  intake: "Toplama iki kat hızlı",
  feed: "Atışlar arası {v} sn",
  spinUp: "Shooter {v} sn'de hızlanıyor",
  turret: "Taret ekle",
};

interface Result {
  id: number;
  best: Plan;
  others: Plan[];
  tried: number;
}

export default function AutoPlanner({ onClose }: { onClose: () => void }) {
  const t = useT();
  const appConfig = useStore((s) => s.config),
    origin = useStore((s) => s.origin),
    chassis = useStore((s) => s.chassis),
    shotPoints = useStore((s) => s.shotPoints),
    bounceSettings = useStore((s) => s.bounceSettings),
    calibrated = useStore((s) => s.measured === "verified"),
    set = useStore((s) => s.set);
  const ball = useMemo(
    () => ballModelSettings(bounceSettings),
    [bounceSettings],
  );
  // Only the places matter to the map; renaming a point must not redo it.
  const extraKey = JSON.stringify(shotPoints.map((p) => [p.x, p.y]));
  const extra = useMemo(
    () =>
      (JSON.parse(extraKey) as [number, number][]).map(([x, y]) => ({ x, y })),
    [extraKey],
  );
  const appSpec = useMemo(
    () => origin?.spec ?? inferSpec(appConfig),
    [origin, appConfig],
  );
  const sources = useMemo(sourcesAvailable, []);
  const init = useMemo(loadPlannerState, []);
  const [picked, setPicked] = useState<Picked>(() =>
    // First visit: the robot already described in this app, no questions.
    init.robotId === null ||
    init.robotId === "__manual" ||
    !sources.some((s) => s.id === init.robotId)
      ? { kind: "manual" }
      : { kind: "source", id: init.robotId },
  );
  const [shooterChoice, setShooterChoice] = useState(init.shooterChoice);
  const [overrides, setOverrides] = useState(init.overrides);
  const [alliance, setAlliance] = useState<Alliance>(init.alliance);
  const [startIndex, setStartIndex] = useState(init.startIndex);
  const [enabled, setEnabled] = useState(init.enabled);
  const [settings, setSettings] = useState<PlanSettings>(init.settings);
  const [spacing, setSpacing] = useState(init.spacing);
  const [mapLayer, setMapLayer] = useState(init.mapLayer);
  const [result, setResult] = useState<Result | null>(null);
  const [advice, setAdvice] = useState<{ id: number; list: Advice[] } | null>(
    null,
  );
  const [shown, setShown] = useState(0);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState("");
  const [activeStep, setActiveStep] = useState(-1);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const stage = useRef<StageHandle>(null);
  const shot = useShotMaps();

  useEffect(() => {
    savePlannerState({
      robotId:
        picked.kind === "source"
          ? picked.id
          : picked.kind === "manual"
            ? "__manual"
            : null,
      shooterChoice,
      overrides,
      alliance,
      startIndex,
      enabled,
      settings,
      spacing,
      mapLayer,
    });
  }, [
    picked,
    shooterChoice,
    overrides,
    alliance,
    startIndex,
    enabled,
    settings,
    spacing,
    mapLayer,
  ]);

  // Robot: drivetrain from the chosen Builder robot, shooter by choice.
  const base = useMemo((): {
    robot: AutoRobot | null;
    probot: ProbotRobot | null;
    error: string;
  } => {
    if (picked.kind === "manual")
      return {
        robot: manualRobot(appConfig, appSpec, chassis),
        probot: null,
        error: "",
      };
    const loaded =
      picked.kind === "file"
        ? { robot: picked.robot, notlar: picked.notes }
        : (() => {
            const src = sources.find((s) => s.id === picked.id);
            return src ? loadRobot(src) : "Robot bulunamadı";
          })();
    if (typeof loaded === "string")
      return { robot: null, probot: null, error: loaded };
    const r = robotFromProbot(
      loaded.robot,
      appConfig,
      appSpec,
      picked.kind === "file" ? "file" : "builder",
      loaded.notlar,
    );
    if (shooterChoice === "app" && r.shooterOrigin === "builder")
      return {
        robot: {
          ...r,
          shooter: appConfig,
          shooterSpec: appSpec,
          shooterOrigin: "app",
          notes: r.notes.filter((n) => !n.startsWith("Shooter,")),
        },
        probot: loaded.robot,
        error: "",
      };
    return { robot: r, probot: loaded.robot, error: "" };
  }, [picked, sources, shooterChoice, appConfig, appSpec, chassis]);
  const robot = useMemo(
    () => (base.robot ? { ...base.robot, ...overrides } : null),
    [base.robot, overrides],
  );
  const builderHasShooter =
    base.robot?.shooterOrigin === "builder" || shooterChoice === "app";

  const startList = useMemo(() => starts("blue"), []);
  // G304 starts give the robot's footprint centre; plans use its turning point.
  const start = useMemo(() => {
    const centre = startList[Math.min(startIndex, startList.length - 1)].pose;
    return robot ? fromFootprint(robot, centre) : centre;
  }, [robot, startIndex, startList]);
  const pickup = useMemo(() => pickupSources("blue"), []);
  const all = useMemo((): PickupSource[] => {
    const preload: PickupSource = {
      id: "preload",
      kind: "preload",
      label: "Ön yük",
      balls: 4,
      points: [],
      approach: { x: start.x, y: start.y, facing: start.h },
    };
    return [preload, ...pickup];
  }, [pickup, start]);
  const chosen = useMemo(
    () => all.filter((s) => enabled[s.id]),
    [all, enabled],
  );

  // Shot map: follows the shooter on its own, coarse grid first.
  const shooter = robot?.shooter,
    turret = robot?.turret ?? false,
    halfX = robot?.halfX ?? 0,
    halfY = robot?.halfY ?? 0;
  const compute = shot.compute;
  const mapRun = useCallback(
    (fresh = false) => {
      if (!shooter || !(halfX > 0.02) || !(halfY > 0.02)) return;
      compute(
        shooter,
        turret,
        spacing < COARSE ? [COARSE, spacing] : [spacing],
        halfX,
        halfY,
        // Saved points and the ball model belong to this app's own shooter.
        shooter === appConfig ? { ball, extra, fresh } : { fresh },
      );
    },
    [compute, shooter, turret, spacing, halfX, halfY, appConfig, ball, extra],
  );
  useEffect(() => {
    const h = setTimeout(mapRun, 350);
    return () => clearTimeout(h);
  }, [mapRun]);

  // Plan: one worker for the whole visit; answers to old requests are dropped.
  const worker = useRef<Worker | null>(null);
  const request = useRef(0);
  useEffect(() => {
    const w = new Worker(new URL("./plan.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = (e) => {
      const m = e.data;
      if (m.id !== request.current) return;
      if (m.type === "result") {
        setResult({ id: m.id, best: m.best, others: m.others, tried: m.tried });
        setShown(0);
        setPlanning(false);
      } else if (m.type === "coach") setAdvice({ id: m.id, list: m.advice });
      else {
        setPlanError(m.message);
        setPlanning(false);
      }
    };
    w.onerror = (e) => {
      setPlanError(e.message);
      setPlanning(false);
    };
    return () => w.terminate();
  }, []);
  const maps = shot.maps,
    mapsCurrent = shot.current;
  const input = useMemo(
    (): PlanInput | null =>
      robot && maps && mapsCurrent && chosen.length
        ? { robot, start, sources: chosen, maps, settings }
        : null,
    [robot, start, chosen, maps, mapsCurrent, settings],
  );
  useEffect(() => {
    if (!input) return;
    const id = ++request.current;
    setPlanning(true);
    setPlanError("");
    const h = setTimeout(() => worker.current?.postMessage({ id, input }), 200);
    return () => clearTimeout(h);
  }, [input]);

  const usable = !!robot && chosen.length > 0;
  const current =
    usable && result ? [result.best, ...result.others][shown] : null;
  const stale = !input || planning;
  const refining =
    shot.progress !== null &&
    !!maps &&
    mapsCurrent &&
    maps.first.spacing > spacing;

  // Physics check: 2D runs by itself once the plan has settled; 3D on demand.
  const [check, setCheck] = useState<{
    busy: Engine | null;
    result: Verification | null;
    error: string;
  }>({ busy: null, result: null, error: "" });
  const checker = useRef<Worker | null>(null);
  const probot = base.probot;
  const runCheck = useCallback(
    (engine: Engine) => {
      if (!current || !robot || !probot) return;
      checker.current?.terminate();
      setCheck({ busy: engine, result: null, error: "" });
      const w = new Worker(new URL("./verify.worker.ts", import.meta.url), {
        type: "module",
      });
      checker.current = w;
      w.onmessage = (e) => {
        w.terminate();
        setCheck(
          e.data.type === "result"
            ? { busy: null, result: e.data.result, error: "" }
            : { busy: null, result: null, error: e.data.message },
        );
      };
      w.onerror = (e) => {
        w.terminate();
        setCheck({ busy: null, result: null, error: e.message });
      };
      w.postMessage({
        robot: probot,
        auto: robot,
        plan: current,
        start,
        engine,
      });
    },
    [current, robot, probot, start],
  );
  useEffect(() => {
    setCheck({ busy: null, result: null, error: "" });
    if (stale || refining) return;
    const h = setTimeout(() => runCheck("light"), 500);
    return () => {
      clearTimeout(h);
      checker.current?.terminate();
    };
  }, [runCheck, stale, refining]);

  const patch = (p: Partial<AutoRobot>) =>
    setOverrides((o) => ({ ...o, ...p }));
  const manual = picked.kind === "manual";
  /** The app robot's drive and turret live with the robot, not the planner. */
  const setChassis = (
    p: Partial<{ drive: "holonomic" | "tank"; turret: boolean }>,
  ) => {
    set({
      chassis: {
        drive: chassis?.drive ?? "holonomic",
        turret: chassis?.turret ?? false,
        ...p,
      },
    });
    setOverrides((o) => {
      const rest = { ...o };
      delete rest.turret;
      delete rest.drive;
      return rest;
    });
  };
  const ownShooter = !!robot && robot.shooter === appConfig;
  const hoodOffset = robot?.shooter.shooter.hoodOffset ?? 0;
  const showInSim = (step: Step) => {
    if (step.kind !== "shoot") return;
    const { spot } = step;
    useStore
      .getState()
      .setConfig(placed(appConfig, spot.x, spot.y, spot.angle, spot.omega));
    set({ autoOpen: false, stage: "shot" });
  };
  const savePoint = (step: Step) => {
    if (step.kind !== "shoot") return;
    const { spot } = step;
    useStore.getState().saveShotPoint({
      x: spot.x,
      y: spot.y,
      heading: spot.heading,
      omega: spot.omega,
      hoodAngle: spot.angle,
      clearance: spot.clearance,
      source: "plan",
    });
  };
  const designShooter = () =>
    set({ autoOpen: false, autoReturn: true, setupOpen: "new" });
  const reset = () => {
    const d = defaultPlannerState;
    setShooterChoice(d.shooterChoice);
    setOverrides({});
    setAlliance(d.alliance);
    setStartIndex(d.startIndex);
    setEnabled(d.enabled);
    setSettings(d.settings);
    setSpacing(d.spacing);
    setMapLayer(d.mapLayer);
  };
  /** Make the coach's hypothetical change real: write it into the settings. */
  const applyAdvice = (id: string) => {
    const change = changes.find((c) => c[0] === id)?.[1];
    if (!change || !input || !robot) return;
    const next = change(input)?.input;
    if (!next) return;
    const p: Record<string, unknown> = {};
    for (const k of Object.keys(next.robot) as (keyof AutoRobot)[])
      if (next.robot[k] !== robot[k]) p[k] = next.robot[k];
    patch(p as Partial<AutoRobot>);
    setSettings(next.settings);
  };
  const copy = async () => {
    if (!current || !robot) return;
    try {
      await navigator.clipboard.writeText(
        planText(current, robot.name, start, t, hoodOffset),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setPlanError(t("Panoya kopyalanamadı."));
    }
  };

  const noHit = !!maps && mapsCurrent && maps.first.spots.length === 0;
  const status = base.error
    ? { kind: "bad", text: t("Robot yüklenemedi") }
    : !chosen.length
      ? { kind: "idle", text: t("Top kaynağı seç") }
      : shot.progress !== null
        ? {
            kind: "busy",
            text: t.f(
              refining
                ? "Kaba plan hazır · ince harita %{p}"
                : "Atış haritası %{p}",
              { p: Math.round(shot.progress * 100) },
            ),
          }
        : planning
          ? { kind: "busy", text: t("Planlanıyor…") }
          : shot.error || planError
            ? { kind: "bad", text: t("Hata") }
            : current
              ? { kind: "ok", text: t("Plan güncel") }
              : { kind: "busy", text: t("Hazırlanıyor…") };

  const empty = base.error ? (
    <p className="setup-error">{t(base.error)}</p>
  ) : !chosen.length ? (
    <p>{t("Planlamak için en az bir top kaynağı seç.")}</p>
  ) : shot.error || planError ? (
    <p className="setup-error">{shot.error || planError}</p>
  ) : (
    <>
      <div className="auto-progress">
        <span style={{ width: `${Math.round((shot.progress ?? 1) * 100)}%` }} />
      </div>
      <p>
        {t(
          shot.progress !== null
            ? "Shooter'ının sahanın neresinden isabet ettirdiği çıkarılıyor…"
            : "En hızlı oto aranıyor…",
        )}
      </p>
      <small>
        {t("İlk sefer birkaç saniye sürer; sonra bu shooter için hatırlanır.")}
      </small>
    </>
  );

  const legs = check.result?.legs ?? null;
  const good = legs ? legs.filter((l) => legOk(l)).length : 0;
  const budget = current?.budget;
  const idle = current ? Math.max(0, settings.autoLength - current.end) : 0;
  const budgetTotal = budget
    ? budget.drive + budget.pickup + budget.shoot + budget.wait + idle
    : 1;
  const coachList =
    advice && result && advice.id === result.id && shown === 0
      ? advice.list
      : null;

  return (
    <div className="auto-planner">
      <div className="auto-bar">
        <strong>{t("Oto planlayıcı")}</strong>
        <span className="auto-sub">
          {t("Probot Sim sürüşü + bu uygulamanın atış fiziği")}
        </span>
        {ownShooter && (
          <button
            className={`auto-calibration ${calibrated ? "on" : ""}`}
            title={t(
              "Atış hızları ve açıları bu uygulamanın fizik modelinden gelir. Robota aktar adımında gerçek atışlarını girince model robotuna göre düzeltilir.",
            )}
            onClick={() => set({ autoOpen: false, stage: "export" })}
          >
            {t(
              calibrated
                ? "Ölçümle kalibre edildi"
                : "Simülasyon · robotta ölçülmedi",
            )}
          </button>
        )}
        <span className={`auto-status ${status.kind}`} role="status">
          <i />
          {status.text}
        </span>
        <button className="link-button" onClick={reset}>
          {t("Sıfırla")}
        </button>
        <button className="link-button" onClick={onClose}>
          {t("Simülasyona dön")}
        </button>
      </div>
      <div className="auto-body">
        <aside className="auto-side">
          <section>
            <h3>{t("Robot")}</h3>
            <label className="auto-select">
              <span>{t("Şasi ve ölçüler")}</span>
              <select
                value={
                  picked.kind === "source"
                    ? picked.id
                    : picked.kind === "file"
                      ? "__file"
                      : "__manual"
                }
                onChange={(e) => {
                  setOverrides({});
                  if (e.target.value === "__manual")
                    setPicked({ kind: "manual" });
                  else if (e.target.value === "__file")
                    fileRef.current?.click();
                  else setPicked({ kind: "source", id: e.target.value });
                }}
              >
                <option value="__manual">
                  {t("Bu uygulamadaki robotum")} · {appConfig.name}
                </option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {t(s.tur === "hazir" ? "Builder hazır robotu" : "Builder")}
                    {" · "}
                    {s.ad}
                  </option>
                ))}
                {picked.kind === "file" && (
                  <option value="__file">{picked.robot.ad}</option>
                )}
                <option value="__file">
                  {t("Probot robot dosyası (.json)…")}
                </option>
              </select>
            </label>
            <input
              ref={fileRef}
              hidden
              type="file"
              accept=".json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  const r = readRobotFile(JSON.parse(await f.text()));
                  if (typeof r === "string") throw new Error(r);
                  setOverrides({});
                  setPicked({ kind: "file", robot: r, notes: [] });
                } catch (err) {
                  setPlanError(
                    err instanceof Error ? err.message : String(err),
                  );
                }
              }}
            />
            {base.error && <p className="setup-error">{t(base.error)}</p>}
            {robot && (
              <>
                {manual && (
                  <>
                    <div className="seg">
                      {(["holonomic", "tank"] as const).map((d) => (
                        <button
                          key={d}
                          className={robot.drive === d ? "active" : ""}
                          aria-pressed={robot.drive === d}
                          onClick={() => setChassis({ drive: d })}
                        >
                          {t(d === "tank" ? "Tank" : "Mecanum / holonomik")}
                        </button>
                      ))}
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={robot.turret}
                        onChange={(e) =>
                          setChassis({ turret: e.target.checked })
                        }
                      />
                      <span>{t("Taret var (şasi dönmeden nişan alır)")}</span>
                    </label>
                  </>
                )}
                {!manual && (
                  <label className="auto-select">
                    <span>{t("Shooter")}</span>
                    <select
                      value={robot.shooterOrigin}
                      onChange={(e) =>
                        setShooterChoice(e.target.value as "builder" | "app")
                      }
                    >
                      {builderHasShooter && (
                        <option value="builder">
                          {t("Builder'daki Probot shooter modülü")}
                        </option>
                      )}
                      <option value="app">
                        {t("Bu uygulamadaki robotum")}: {appConfig.name}
                      </option>
                    </select>
                  </label>
                )}
                <button className="link-button" onClick={designShooter}>
                  {t("Kendi shooter'ımı kur…")}
                </button>
                <p className="auto-facts">
                  <span>
                    {fmt(robot.halfX * 200, 0)} × {fmt(robot.halfY * 200, 0)} cm
                  </span>
                  <span>
                    {t(robot.drive === "tank" ? "tank" : "holonomik")}
                  </span>
                  <span>{fmt(robot.maxSpeed, 2)} m/s</span>
                  <span>
                    {robot.capacity} {t("top")}
                  </span>
                </p>
                <details className="auto-details">
                  <summary>{t("Robot değerlerini düzenle")}</summary>
                  <div className="auto-grid">
                    <Num
                      label="Boy"
                      unit="m"
                      step={0.01}
                      value={robot.halfX * 2}
                      onChange={(v) => patch({ halfX: v / 2 })}
                    />
                    <Num
                      label="En"
                      unit="m"
                      step={0.01}
                      value={robot.halfY * 2}
                      onChange={(v) => patch({ halfY: v / 2 })}
                    />
                    <Num
                      label="Azami hız"
                      unit="m/s"
                      value={robot.maxSpeed}
                      onChange={(v) => patch({ maxSpeed: Math.max(0.1, v) })}
                    />
                    <Num
                      label="İvme"
                      unit="m/s²"
                      value={robot.maxAccel}
                      onChange={(v) => patch({ maxAccel: Math.max(0.1, v) })}
                    />
                    <Num
                      label="Dönüş hızı"
                      unit="°/s"
                      step={10}
                      value={robot.maxTurnRate * deg}
                      onChange={(v) =>
                        patch({ maxTurnRate: Math.max(10, v) / deg })
                      }
                    />
                    <Num
                      label="Kapasite"
                      unit="top"
                      step={1}
                      value={robot.capacity}
                      onChange={(v) =>
                        patch({ capacity: Math.max(1, Math.round(v)) })
                      }
                    />
                    <Num
                      label="Yerden alma"
                      unit="sn/top"
                      step={0.05}
                      value={robot.intakePerBall}
                      onChange={(v) => patch({ intakePerBall: v })}
                    />
                    <Num
                      label="FLOWER'dan alma"
                      unit="sn/top"
                      step={0.05}
                      value={robot.flowerPerBall}
                      onChange={(v) => patch({ flowerPerBall: v })}
                    />
                    <Num
                      label="Atışlar arası"
                      unit="sn"
                      step={0.05}
                      value={robot.feedInterval}
                      onChange={(v) =>
                        patch({ feedInterval: Math.max(0.05, v) })
                      }
                    />
                    <Num
                      label="Shooter hızlanma"
                      unit="sn"
                      step={0.1}
                      value={settings.spinUp}
                      onChange={(v) => setSettings({ ...settings, spinUp: v })}
                    />
                  </div>
                  <p className="hint">
                    {t(
                      "Shooter hızlanma süresi bir tahmin; robotunda ölçüp buraya yaz.",
                    )}
                  </p>
                  {!manual && (
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={robot.turret}
                        onChange={(e) => patch({ turret: e.target.checked })}
                      />
                      <span>{t("Taret var (şasi dönmeden nişan alır)")}</span>
                    </label>
                  )}
                  {robot.wheelFreeSpeed > 0 && (
                    <p className="hint">
                      {t("teker serbest hızı")} {fmt(robot.wheelFreeSpeed, 2)}{" "}
                      m/s
                    </p>
                  )}
                  {robot.notes.map((n) => (
                    <p key={n} className="hint">
                      {t(n)}
                    </p>
                  ))}
                  {Object.keys(overrides).length > 0 && (
                    <button
                      className="link-button"
                      onClick={() => setOverrides({})}
                    >
                      {t("Robotun kendi değerlerine dön")}
                    </button>
                  )}
                </details>
              </>
            )}
          </section>

          <section>
            <h3>{t("Maç")}</h3>
            <div className="seg">
              {(["blue", "red"] as const).map((a) => (
                <button
                  key={a}
                  className={`${a} ${alliance === a ? "active" : ""}`}
                  onClick={() => setAlliance(a)}
                >
                  {t(a === "blue" ? "Mavi" : "Kırmızı")}
                </button>
              ))}
            </div>
            <label className="auto-select">
              <span>{t("Başlangıç konumu")}</span>
              <select
                value={Math.min(startIndex, startList.length - 1)}
                onChange={(e) => setStartIndex(Number(e.target.value))}
              >
                {startList.map((s, i) => (
                  <option key={s.label} value={i}>
                    {t(s.label.replace(/^(Mavi|Kırmızı), /, ""))}
                  </option>
                ))}
              </select>
            </label>
            <span className="auto-label">{t("Toplanacak POLLEN")}</span>
            <div className="auto-chips">
              {all.map((s) => {
                const used = current?.order.includes(s.label);
                return (
                  <button
                    key={s.id}
                    className={`${enabled[s.id] ? "on" : ""} ${enabled[s.id] && current && !stale && !used ? "skipped" : ""}`}
                    aria-pressed={!!enabled[s.id]}
                    title={
                      enabled[s.id] && current && !stale && !used
                        ? t("En iyi plan bu kaynağı kullanmıyor.")
                        : undefined
                    }
                    onClick={() =>
                      setEnabled({ ...enabled, [s.id]: !enabled[s.id] })
                    }
                  >
                    {t(s.label)} <b>{s.balls}</b>
                  </button>
                );
              })}
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.preloadInside}
                onChange={(e) =>
                  setSettings({ ...settings, preloadInside: e.target.checked })
                }
              />
              <span>{t("Ön yük robotun içinde başlar")}</span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.park}
                onChange={(e) =>
                  setSettings({ ...settings, park: e.target.checked })
                }
              />
              <span>{t("Sonunda LOADING ZONE'a park et")}</span>
            </label>
          </section>

          <section>
            <h3>{t("Atış haritası")}</h3>
            <label className="auto-select">
              <span>{t("Izgara aralığı")}</span>
              <select
                value={spacing}
                onChange={(e) => setSpacing(Number(e.target.value))}
              >
                {[0.4, 0.3, 0.25, 0.2, 0.15].map((v) => (
                  <option key={v} value={v}>
                    {v * 100} cm
                  </option>
                ))}
              </select>
            </label>
            {maps && mapsCurrent && (
              <p className="hint">
                {t.f(
                  "İsabetli nokta: ilk CELL {a} / {n}, devrildikten sonra {b} / {n}.",
                  {
                    a: maps.first.spots.length,
                    b: maps.tipped.spots.length,
                    n: maps.first.tried,
                  },
                )}{" "}
                ({maps.first.spacing * 100} cm)
              </p>
            )}
            {shot.error && <p className="setup-error">{shot.error}</p>}
            <button
              className="link-button"
              disabled={!robot || shot.progress !== null}
              onClick={() => mapRun(true)}
            >
              {t("Haritayı baştan hesapla")}
            </button>
          </section>
        </aside>

        <Stage
          handle={stage}
          alliance={alliance}
          plan={current}
          start={start}
          robot={robot}
          maps={maps}
          layer={mapLayer}
          sources={pickup}
          target={robot?.shooter.field.target ?? appConfig.field.target}
          autoLength={settings.autoLength}
          check={check.result}
          stale={stale}
          onStep={setActiveStep}
          empty={empty}
        >
          <div className="seg map-layer">
            {(["first", "tipped", "none"] as const).map((l) => (
              <button
                key={l}
                className={mapLayer === l ? "active" : ""}
                onClick={() => setMapLayer(l)}
              >
                {t(
                  l === "first"
                    ? "İlk CELL isabet noktaları"
                    : l === "tipped"
                      ? "Devrildikten sonra"
                      : "Harita yok",
                )}
              </button>
            ))}
          </div>
        </Stage>

        <aside className={`auto-result ${stale && current ? "stale" : ""}`}>
          {!current && (
            <div className="auto-how">
              <strong>{t("Burada ne olacak?")}</strong>
              <ol>
                <li>{t("Robotunu ve shooter'ını seç.")}</li>
                <li>
                  {t("Atış haritası ve en hızlı oto kendiliğinden hesaplanır.")}
                </li>
                <li>
                  {t(
                    "Planı sahada izle, Probot Sim fiziğinde dene, robotunda neyin daha çok puan getireceğine bak.",
                  )}
                </li>
              </ol>
            </div>
          )}
          {current && result && robot && (
            <>
              <div className="auto-score">
                <span className="big">{current.score}</span>
                <span className="unit">{t("puan")}</span>
                <span
                  className={`when ${current.end > settings.autoLength + 1e-6 ? "over" : ""}`}
                >
                  {t.f("Bitiş {t} s", { t: fmt(current.end) })}
                  {idle >= 0.05 && (
                    <small>{t.f("{t} sn boşta", { t: fmt(idle) })}</small>
                  )}
                </span>
              </div>
              <div className="auto-points">
                <span className={current.breakdown.tip ? "on" : ""}>
                  TIP ×{current.tips.length} <b>{current.breakdown.tip}</b>
                </span>
                <span className={current.breakdown.park ? "on" : ""}>
                  PARK <b>{current.breakdown.park}</b>
                </span>
                <span className={current.breakdown.leave ? "on" : ""}>
                  LEAVE <b>{current.breakdown.leave}</b>
                </span>
              </div>
              {noHit && (
                <p className="setup-error">
                  {t(
                    "Bu shooter hiçbir noktadan ilk CELL'e isabet ettiremiyor. Shooter'ı değiştir ya da kendi shooter'ını kur.",
                  )}
                </p>
              )}
              {current.notes.map((n) => (
                <p key={n.text} className="setup-error">
                  {t.f(n.text, n.values ?? {})}
                </p>
              ))}

              {budget && (
                <section className="auto-card">
                  <h4>{t("30 saniye nereye gidiyor?")}</h4>
                  <div className="auto-budget">
                    {(
                      [
                        ["drive", budget.drive, "Sürüş"],
                        ["pickup", budget.pickup, "Toplama"],
                        ["shoot", budget.shoot, "Atış"],
                        ["wait", budget.wait, "Bekleme"],
                        ["idle", idle, "Boşta"],
                      ] as const
                    )
                      .filter((b) => b[1] > 0.05)
                      .map(([k, v, label]) => (
                        <span
                          key={k}
                          className={k}
                          style={{ flexGrow: v / budgetTotal }}
                          title={`${t(label)} ${fmt(v)} s`}
                        />
                      ))}
                  </div>
                  <div className="auto-legend">
                    {(
                      [
                        ["drive", budget.drive, "Sürüş"],
                        ["pickup", budget.pickup, "Toplama"],
                        ["shoot", budget.shoot, "Atış"],
                        ["wait", budget.wait, "Bekleme"],
                      ] as const
                    )
                      .filter((b) => b[1] > 0.05)
                      .map(([k, v, label]) => (
                        <span key={k}>
                          <i className={k} />
                          {t(label)} <b>{fmt(v)}</b>
                        </span>
                      ))}
                  </div>
                </section>
              )}

              <section className="auto-card">
                <h4>{t("Probot Sim fiziğinde")}</h4>
                {!probot ? (
                  <p className="hint">
                    {t(
                      "Doğrulama için Builder robotu ya da robot dosyası gerekir.",
                    )}
                  </p>
                ) : (
                  <>
                    {check.busy && (
                      <p className="check-busy">
                        {t(
                          check.busy === "light"
                            ? "2B fizikte sürülüyor…"
                            : "3B Rapier'de sürülüyor…",
                        )}
                      </p>
                    )}
                    {check.result && legs && (
                      <p className={check.result.ok ? "check-ok" : "check-bad"}>
                        <b>
                          {good}/{legs.length}
                        </b>{" "}
                        {t(
                          check.result.ok
                            ? "sürüş parçasının hepsi tuttu"
                            : "sürüş parçası tuttu",
                        )}{" "}
                        ·{" "}
                        {t.f("en büyük sapma {e} m", {
                          e: fmt(check.result.maxError, 2),
                        })}{" "}
                        ·{" "}
                        {t(
                          check.result.engine === "light" ? "2B" : "3B Rapier",
                        )}
                      </p>
                    )}
                    {check.result && !check.result.ok && (
                      <p className="hint">
                        {t(
                          "Tutmayan parçalar zaman çizgisinde ve adımlarda kırmızı. Hız ya da ivmeyi düşürmek çoğu zaman düzeltir.",
                        )}
                      </p>
                    )}
                    {check.error && (
                      <p className="setup-error">{check.error}</p>
                    )}
                    <div className="seg">
                      {(["light", "rigid"] as const).map((e) => (
                        <button
                          key={e}
                          disabled={!!check.busy || stale}
                          onClick={() => runCheck(e)}
                        >
                          {t(e === "light" ? "2B (hızlı)" : "3B Rapier")}
                        </button>
                      ))}
                    </div>
                    <p className="hint">
                      {t(
                        robot.drive === "tank"
                          ? "Takipçi: RAMSETE (tank)."
                          : "Takipçi: Probot Sim (takip.ts).",
                      )}
                    </p>
                  </>
                )}
              </section>

              <section className="auto-card coach">
                <h4>
                  <Sparkles size={13} />{" "}
                  {t("Robotunda ne daha çok kazandırır?")}
                </h4>
                {shown !== 0 ? (
                  <p className="hint">
                    {t("Öneriler en iyi plan için hesaplanır.")}
                  </p>
                ) : !coachList ? (
                  <p className="hint">{t("Hesaplanıyor…")}</p>
                ) : coachList.length === 0 ? (
                  <p className="hint">
                    {t(
                      "Tek bir değişiklik bu planı belirgin biçimde iyileştirmiyor.",
                    )}
                  </p>
                ) : (
                  <ul>
                    {coachList.map((a) => (
                      <li key={a.id}>
                        <span>
                          {t.f(adviceLabel[a.id] ?? a.id, {
                            v: fmt(a.value, a.id === "capacity" ? 0 : 2),
                          })}
                        </span>
                        <b>
                          {a.dScore > 0 && `+${a.dScore} ${t("puan")}`}
                          {a.dScore > 0 && Math.abs(a.saved) >= 0.1 && " · "}
                          {(a.dScore === 0 || Math.abs(a.saved) >= 0.1) &&
                            `${a.saved >= 0 ? "−" : "+"}${fmt(Math.abs(a.saved))} s`}
                        </b>
                        <button onClick={() => applyAdvice(a.id)}>
                          {t("Dene")}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="hint">
                  {t(
                    "Aynı saha, robotun tek bir özelliği değişmiş hâliyle yeniden planlanır. Ölçüm değil, plan sonucu.",
                  )}
                </p>
              </section>

              {result.others.length > 0 && (
                <section className="auto-card">
                  <h4>{t("Planlar")}</h4>
                  <div className="auto-alts">
                    {[result.best, ...result.others].map((p, i) => (
                      <button
                        key={i}
                        className={shown === i ? "active" : ""}
                        onClick={() => setShown(i)}
                      >
                        <b>{p.score}</b>
                        <span>
                          {p.order.map((o) => t(o)).join(" → ") ||
                            t("Yalnız park")}
                        </span>
                        <small>{fmt(p.end)} s</small>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section className="auto-card">
                <h4>
                  {t("Adımlar")}
                  <button className="link-button" onClick={copy}>
                    {copied ? <Check size={12} /> : <ClipboardCopy size={12} />}{" "}
                    {t(copied ? "Kopyalandı" : "Planı kopyala")}
                  </button>
                </h4>
                <ol className="auto-steps">
                  {current.steps.map((s, i) => (
                    <StepRow
                      key={i}
                      step={s}
                      check={legs?.find((l) => l.step === i)}
                      active={s.kind !== "tip" && activeStep === i}
                      onPick={() => stage.current?.seek(s.t0 + 1e-3)}
                      hoodOffset={hoodOffset}
                      onShow={
                        ownShooter && s.kind === "shoot" && s.cell === "first"
                          ? () => showInSim(s)
                          : undefined
                      }
                      onSave={
                        ownShooter && s.kind === "shoot" && s.cell === "first"
                          ? () => savePoint(s)
                          : undefined
                      }
                    />
                  ))}
                </ol>
              </section>
              <p className="hint">
                {t.f("{n} plan denendi.", { n: result.tried })}{" "}
                {t(
                  "Puanlar ve devrilme modeli Probot Sim'den (LEAVE 3, PARK 5, TIP 20; CELL 0,19 kg'ı geçince devrilir, ilk CELL'de 3 NECTAR). Kılavuzla doğrulanmadı.",
                )}
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function StepRow({
  step,
  active,
  onPick,
  check,
  hoodOffset,
  onShow,
  onSave,
}: {
  step: Step;
  active: boolean;
  onPick: () => void;
  check?: LegCheck;
  hoodOffset: number;
  /** Shots with this app's shooter can be opened in, or saved to, the simulator. */
  onShow?: () => void;
  onSave?: () => void;
}) {
  const t = useT();
  return (
    <li className={`${step.kind} ${active ? "active" : ""}`} onClick={onPick}>
      <span className="t">{fmt(step.t0)}</span>
      <span className="what">{stepText(step, t, hoodOffset)}</span>
      {onShow && (
        <button
          className="step-act"
          title={t("Simülatörde göster")}
          aria-label={t("Simülatörde göster")}
          onClick={(e) => {
            e.stopPropagation();
            onShow();
          }}
        >
          <Eye size={13} />
        </button>
      )}
      {onSave && (
        <button
          className="step-act"
          title={t("Atış noktalarına ekle")}
          aria-label={t("Atış noktalarına ekle")}
          onClick={(e) => {
            e.stopPropagation();
            onSave();
          }}
        >
          <MapPin size={13} />
        </button>
      )}
      {check && (
        <span
          className={`leg-mark ${legOk(check) ? "ok" : "bad"}`}
          title={`max ${fmt(check.maxError, 2)} m · ${fmt(check.endError, 2)} m · ${Math.round(check.endHeadingError * deg)}°`}
        >
          {legOk(check)
            ? "✓"
            : `✗ ${fmt(check.endError, 2)} m · ${Math.round(check.endHeadingError * deg)}°`}
        </span>
      )}
    </li>
  );
}
