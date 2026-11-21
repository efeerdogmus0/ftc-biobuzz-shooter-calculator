// The middle of the planner: the field with the animated playback, the
// transport (play / pause, speed, restart) and the timeline. It owns the
// playback clock so that 60 redraws a second stay inside this component.
import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useT } from "../i18n/useT";
import type { TargetConfig } from "../physics/types";
import type { Alliance, PickupSource, Pose } from "./field";
import type { Plan } from "./planner";
import type { AutoRobot } from "./robot";
import type { ShotMaps } from "./useShotMaps";
import type { Verification } from "./verify";
import { playbackLength, worldAt } from "./playback";
import FieldView from "./FieldView";
import Timeline from "./Timeline";

export interface StageHandle {
  seek: (t: number) => void;
}
const SPEEDS = [0.5, 1, 2, 4];

export default function Stage({
  handle,
  alliance,
  plan,
  start,
  robot,
  maps,
  layer,
  sources,
  target,
  autoLength,
  check,
  stale,
  onStep,
  empty,
  children,
}: {
  handle: Ref<StageHandle>;
  alliance: Alliance;
  plan: Plan | null;
  start: Pose;
  robot: AutoRobot | null;
  maps: ShotMaps | null;
  layer: "first" | "tipped" | "none";
  sources: PickupSource[];
  target: TargetConfig;
  autoLength: number;
  check: Verification | null;
  stale: boolean;
  /** Called when the robot moves on to another step (-1: none). */
  onStep: (index: number) => void;
  /** Shown over the field while there is no plan yet. */
  empty: ReactNode;
  children?: ReactNode;
}) {
  const t = useT();
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const length = plan ? playbackLength(plan, autoLength) : 0;
  const span = Math.max(autoLength, length);
  const started = useRef(false);

  // The first plan plays by itself; later re-plans keep the playhead.
  useEffect(() => {
    if (!plan) return;
    if (!started.current) {
      started.current = true;
      setTime(0);
      setPlaying(true);
    } else setTime((v) => Math.min(v, playbackLength(plan, autoLength)));
  }, [plan, autoLength]);

  useEffect(() => {
    if (!playing || !plan) return;
    let frame = 0,
      last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setTime((v) => {
        const next = v + dt * speed;
        if (next >= length) {
          setPlaying(false);
          return length;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, plan, speed, length]);

  const seek = (v: number) => setTime(Math.max(0, Math.min(length, v)));
  const toggle = () => {
    if (!plan) return;
    if (!playing && time >= length - 1e-6) setTime(0);
    setPlaying((p) => !p);
  };
  useImperativeHandle(handle, () => ({
    seek: (v: number) => {
      setPlaying(false);
      setTime(Math.max(0, Math.min(length, v)));
    },
  }));

  // Space: play / pause. Arrows: half a second. Home: restart.
  const keys = useRef({ toggle, seek, time });
  keys.current = { toggle, seek, time };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName)) return;
      const k = keys.current;
      if (e.code === "Space") k.toggle();
      else if (e.code === "ArrowLeft") k.seek(k.time - 0.5);
      else if (e.code === "ArrowRight") k.seek(k.time + 0.5);
      else if (e.code === "Home") k.seek(0);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  const world = useMemo(
    () => (plan ? worldAt(plan, start, time, autoLength) : null),
    [plan, start, time, autoLength],
  );
  const step = world?.step ?? -1;
  useEffect(() => onStep(step), [step, onStep]);

  return (
    <main className="auto-main">
      <div className="auto-stage">
        <FieldView
          alliance={alliance}
          plan={plan}
          world={world}
          track={check?.track ?? null}
          start={start}
          robot={robot}
          maps={maps}
          layer={layer}
          sources={sources}
          target={target}
          stale={stale}
        />
        {world && (
          <div className={`auto-hud ${alliance}`} aria-live="off">
            <span className="hud-score">
              <b>{world.score}</b> {t("puan")}
            </span>
            <span className="hud-time">
              {time.toFixed(1)} <small>/ {autoLength} s</small>
            </span>
          </div>
        )}
        {!plan && <div className="auto-empty">{empty}</div>}
      </div>
      {plan && (
        <div className="auto-transport">
          <button
            className="play"
            onClick={toggle}
            aria-label={t(playing ? "Duraklat" : "Oynat")}
            title={`${t(playing ? "Duraklat" : "Oynat")} (Space)`}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            onClick={() => {
              setTime(0);
              setPlaying(true);
            }}
            aria-label={t("Baştan oynat")}
            title={t("Baştan oynat")}
          >
            <RotateCcw size={14} />
          </button>
          <Timeline
            plan={plan}
            time={time}
            span={span}
            autoLength={autoLength}
            legs={check?.legs ?? null}
            onSeek={(v) => {
              setPlaying(false);
              seek(v);
            }}
          />
          <div className="seg speeds">
            {SPEEDS.map((s) => (
              <button
                key={s}
                className={speed === s ? "active" : ""}
                onClick={() => setSpeed(s)}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
      )}
      {children}
    </main>
  );
}
