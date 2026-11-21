// Runs the shot-table sweep and the real-shot comparison off the main thread.
// A sweep is kept per robot/ball physics (not pose: it stores its own line),
// so driving the robot or leaving the step keeps it; a physics edit drops it.
import { useEffect, useRef, useState } from "react";
import type { Config } from "../physics/types";
import type { BallModelSettings } from "../physics/launchDynamics";
import { calibrationStamp } from "../physics/analysis";
import type { SweepOptions, SweepResult } from "./shotTable";
import type { Comparison, LoggedShot } from "./shotLog";
import type { ExportRequest } from "../workers/export.worker";

const kept: { sweep?: { key: string; result: SweepResult } } = {};
const sweepKey = (c: Config, m: BallModelSettings, o: SweepOptions) =>
  `${calibrationStamp(c, m)}|${JSON.stringify(o)}`;

function start(
  request: ExportRequest,
  onProgress: (f: number) => void,
  onDone: (result: unknown) => void,
  onError: (e: string) => void,
) {
  const worker = new Worker(
    new URL("../workers/export.worker.ts", import.meta.url),
    { type: "module" },
  );
  worker.onmessage = (
    e: MessageEvent<{
      kind: string;
      progress?: number;
      result?: unknown;
      error?: string;
    }>,
  ) => {
    if (e.data.kind === "progress") onProgress(e.data.progress ?? 0);
    else if (e.data.kind === "error") {
      onError(e.data.error ?? "failed");
      worker.terminate();
    } else {
      onDone(e.data.result);
      worker.terminate();
    }
  };
  worker.onerror = (e) => {
    onError(e.message || "failed");
    worker.terminate();
  };
  worker.postMessage(request);
  return worker;
}

export function useSweep(
  config: Config,
  model: BallModelSettings,
  options: SweepOptions,
) {
  const [, rerender] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const job = useRef<Worker | null>(null);
  useEffect(() => () => job.current?.terminate(), []);
  const key = sweepKey(config, model, options);
  const result = kept.sweep?.key === key ? kept.sweep.result : null;
  const run = () => {
    job.current?.terminate();
    setBusy(true);
    setError("");
    setProgress(0);
    job.current = start(
      { kind: "sweep", config, model, options },
      setProgress,
      (r) => {
        kept.sweep = { key, result: r as SweepResult };
        setBusy(false);
        rerender((n) => n + 1);
      },
      (e) => {
        setError(e);
        setBusy(false);
      },
    );
  };
  const cancel = () => {
    job.current?.terminate();
    job.current = null;
    setBusy(false);
  };
  return { result, busy, progress, error, run, cancel };
}

/** Re-runs a moment after the log, robot or ball model changes. */
export function useComparison(
  config: Config,
  model: BallModelSettings,
  rows: LoggedShot[],
) {
  const [state, setState] = useState<{
    inputs: [Config, BallModelSettings, LoggedShot[]];
    result: Comparison[] | null;
    error: string;
  } | null>(null);
  useEffect(() => {
    if (!rows.length) return;
    let worker: Worker | null = null;
    const timer = setTimeout(() => {
      worker = start(
        { kind: "compare", config, model, rows },
        () => {},
        (r) =>
          setState({
            inputs: [config, model, rows],
            result: r as Comparison[],
            error: "",
          }),
        (e) =>
          setState({ inputs: [config, model, rows], result: null, error: e }),
      );
    }, 250);
    return () => {
      clearTimeout(timer);
      worker?.terminate();
    };
  }, [config, model, rows]);
  const current =
    state &&
    state.inputs[0] === config &&
    state.inputs[1] === model &&
    state.inputs[2] === rows;
  return {
    result: current ? state.result : null,
    error: current ? state.error : "",
    pending: rows.length > 0 && !current,
  };
}
