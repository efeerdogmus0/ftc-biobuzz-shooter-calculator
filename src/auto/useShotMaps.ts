// Computes the two shot maps (first CELL, CELL after the tip) on a pool of
// workers, with progress. A request names several grid spacings, coarse first:
// the coarse map gives a plan within seconds, the fine one replaces it. Maps
// are cached per shooter configuration, in memory and in localStorage, so the
// second visit and every drive-only change cost nothing.
import { useCallback, useEffect, useRef, useState } from "react";
import type { BallModelSettings } from "../physics/launchDynamics";
import type { Config } from "../physics/types";
import { shotGrid, withCell, type ShotMap, type ShotSpot } from "./shotMap";

export interface ShotMaps {
  first: ShotMap;
  tipped: ShotMap;
}
const cache = new Map<string, ShotMaps>();
/** Raise when the flight or shooter physics changes: stored maps become stale. */
const STORE = "shooterlab.shotmaps.v1";
const KEEP = 8;

type Stored = { key: string; maps: ShotMaps }[];
function readStore(): Stored {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function remember(key: string, maps: ShotMaps) {
  cache.set(key, maps);
  try {
    const list = [
      { key, maps },
      ...readStore().filter((e) => e.key !== key),
    ].slice(0, KEEP);
    localStorage.setItem(STORE, JSON.stringify(list));
  } catch {
    // Storage full or blocked: the in-memory cache still works.
  }
}
function recall(key: string) {
  const hit = cache.get(key);
  if (hit) return hit;
  const stored = readStore().find((e) => e.key === key);
  if (stored?.maps?.first?.spots && stored.maps.tipped?.spots) {
    cache.set(key, stored.maps);
    return stored.maps;
  }
  return null;
}

export interface MapOptions {
  /** Ball contact model of the main simulator; the map uses the same one. */
  ball?: BallModelSettings;
  /** Saved shot points: tried in addition to the grid. */
  extra?: { x: number; y: number }[];
  /** Ignore the cache. */
  fresh?: boolean;
}

/** Robot pose and name do not change where the shooter scores. */
export function shooterKey(
  c: Config,
  turret: boolean,
  spacing: number,
  ball?: BallModelSettings,
  extra: { x: number; y: number }[] = [],
) {
  const q = structuredClone(c);
  q.robot.x = 0;
  q.robot.y = 0;
  q.robot.heading = 0;
  q.robot.turretYaw = 0;
  q.name = "";
  return JSON.stringify([
    q.robot,
    q.shooter,
    q.projectile,
    q.aero,
    q.environment,
    q.field.target,
    turret,
    spacing,
    ball ?? null,
    extra.map((p) => [Number(p.x.toFixed(3)), Number(p.y.toFixed(3))]),
  ]);
}

export function useShotMaps() {
  const [maps, setMaps] = useState<ShotMaps | null>(null);
  /** False while `maps` still belongs to an earlier request. */
  const [current, setCurrent] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const workers = useRef<Worker[]>([]);
  const request = useRef(0);
  const stop = useCallback(() => {
    request.current++;
    workers.current.forEach((w) => w.terminate());
    workers.current = [];
    setProgress(null);
  }, []);
  useEffect(() => stop, [stop]);

  const compute = useCallback(
    (
      config: Config,
      turret: boolean,
      spacings: number[],
      halfX: number,
      halfY: number,
      { ball, extra = [], fresh = false }: MapOptions = {},
    ) => {
      stop();
      setError("");
      const id = request.current;
      const keyOf = (spacing: number) =>
        shooterKey(config, turret, spacing, ball, extra) +
        halfX.toFixed(3) +
        halfY.toFixed(3);
      const final = spacings[spacings.length - 1];
      const done = !fresh && recall(keyOf(final));
      if (done) {
        setMaps(done);
        setCurrent(true);
        return;
      }
      setCurrent(false);

      const one = (spacing: number) =>
        new Promise<ShotMaps>((resolve, reject) => {
          const points = shotGrid(spacing, halfX, halfY, extra);
          const jobs = (["first", "tipped"] as const).flatMap((cell) => {
            const n = Math.max(
              1,
              Math.min(4, Math.floor((navigator.hardwareConcurrency || 4) / 2)),
            );
            return Array.from({ length: n }, (_, i) => ({
              cell,
              points: points.filter((_, j) => j % n === i),
            }));
          });
          const total = points.length * 2;
          const count = new Array(jobs.length).fill(0);
          const found: Record<"first" | "tipped", ShotSpot[]> = {
            first: [],
            tipped: [],
          };
          let finished = 0;
          setProgress(0);
          workers.current = jobs.map((job, i) => {
            const w = new Worker(
              new URL("./shotMap.worker.ts", import.meta.url),
              { type: "module" },
            );
            w.onmessage = (e) => {
              if (id !== request.current) return;
              const m = e.data;
              if (m.type === "progress") {
                count[i] = m.done;
                setProgress(count.reduce((a, b) => a + b, 0) / total);
              } else if (m.type === "result") {
                found[job.cell].push(...m.spots);
                w.terminate();
                if (++finished === jobs.length)
                  resolve({
                    first: {
                      cell: "first",
                      spacing,
                      spots: found.first,
                      tried: points.length,
                    },
                    tipped: {
                      cell: "tipped",
                      spacing,
                      spots: found.tipped,
                      tried: points.length,
                    },
                  });
              } else if (m.type === "error") reject(new Error(m.message));
            };
            w.onerror = (e) => reject(new Error(e.message || "Worker failed"));
            w.postMessage({
              config: withCell(config, job.cell),
              points: job.points,
              turret,
              ball,
            });
            return w;
          });
        });

      void (async () => {
        try {
          for (const spacing of spacings) {
            const key = keyOf(spacing);
            const result = (!fresh && recall(key)) || (await one(spacing));
            if (id !== request.current) return;
            remember(key, result);
            setMaps(result);
            setCurrent(true);
          }
          workers.current = [];
          setProgress(null);
        } catch (e) {
          if (id !== request.current) return;
          setError(e instanceof Error ? e.message : String(e));
          stop();
        }
      })();
    },
    [stop],
  );
  return { maps, current, progress, error, compute, stop };
}
