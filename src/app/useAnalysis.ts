import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import {
  defaultUncertainty,
  type Candidate,
  type MonteCarlo,
  type CalibrationResult,
  type CoverageCell,
  type Measurement,
  type FitParameter,
} from "../physics/analysis";
import type { AnalysisRequest } from "../workers/analysis.worker";
export function useAnalysis() {
  const worker = useRef<Worker | null>(null);
  const [busy, setBusy] = useState(""),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [candidates, setCandidates] = useState<Candidate[]>([]),
    [mc, setMC] = useState<MonteCarlo | null>(null),
    [fit, setFit] = useState<CalibrationResult | null>(null),
    [count, setCount] = useState(1000),
    [seed, setSeed] = useState(42),
    [spacing, setSpacing] = useState(0.2),
    [uncertainty, setUncertainty] = useState(defaultUncertainty),
    [measurements, setMeasurements] = useState<Measurement[]>([]),
    [parameters, setParameters] = useState<FitParameter[]>([]);
  const [resultConfig, setResultConfig] = useState("");
  useEffect(() => () => worker.current?.terminate(), []);
  const cancel = () => {
    worker.current?.terminate();
    worker.current = null;
    setBusy("");
  };
  const run = (kind: AnalysisRequest["kind"]) => {
    cancel();
    setError("");
    setBusy(kind);
    setProgress(0);
    const config = structuredClone(useStore.getState().config),
      stamp = JSON.stringify(config);
    worker.current = new Worker(
      new URL("../workers/analysis.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current.onmessage = (
      e: MessageEvent<{
        type: string;
        value: number;
        message: string;
        kind: string;
        result: unknown;
      }>,
    ) => {
      const d = e.data;
      if (d.type === "progress") setProgress(d.value);
      else if (d.type === "error") {
        setError(d.message);
        cancel();
      } else {
        setResultConfig(stamp);
        if (kind === "solve") setCandidates(d.result as Candidate[]);
        if (kind === "coverage")
          useStore
            .getState()
            .set({
              coverage: d.result as CoverageCell[],
              heatSpacing: spacing,
            });
        if (kind === "monteCarlo") setMC(d.result as MonteCarlo);
        if (kind === "calibrate") setFit(d.result as CalibrationResult);
        setProgress(1);
        cancel();
      }
    };
    worker.current.onerror = (e) => {
      setError(e.message);
      cancel();
    };
    worker.current.postMessage({
      kind,
      config,
      spacing,
      count,
      seed,
      uncertainty,
      measurements,
      parameters,
    } satisfies AnalysisRequest);
  };
  return {
    busy,
    progress,
    error,
    candidates,
    mc,
    fit,
    count,
    setCount,
    seed,
    setSeed,
    spacing,
    setSpacing,
    uncertainty,
    setUncertainty,
    measurements,
    setMeasurements,
    parameters,
    setParameters,
    resultConfig,
    run,
    cancel,
  };
}
export type AnalysisState = ReturnType<typeof useAnalysis>;
