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
import {
  ballModelSettings,
  physicsStamp,
  type BallModelSettings,
} from "../physics/launchDynamics";
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
    [measurements, setMeasurements] = useState<Measurement[]>(
      () => useStore.getState().calibration?.measurements ?? [],
    ),
    [fitMeasurements, setFitMeasurements] = useState<Measurement[]>([]),
    [parameters, setParameters] = useState<FitParameter[]>([]);
  const [resultConfig, setResultConfig] = useState("");
  const [candidateConfig, setCandidateConfig] = useState("");
  const [mcConfig, setMCConfig] = useState("");
  const [fitConfig, setFitConfig] = useState("");
  const [candidateModel, setCandidateModel] = useState<BallModelSettings>();
  const [mcModel, setMCModel] = useState<BallModelSettings>();
  const [fitModel, setFitModel] = useState<BallModelSettings>();
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
      model = ballModelSettings(useStore.getState().bounceSettings),
      configJSON = JSON.stringify(config),
      stamp = physicsStamp(config, model);
    const job = new Worker(
      new URL("../workers/analysis.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = job;
    job.onmessage = (
      e: MessageEvent<{
        type: string;
        value: number;
        message: string;
        kind: string;
        result: unknown;
      }>,
    ) => {
      if (worker.current !== job) return;
      const d = e.data;
      if (d.type === "progress") setProgress(d.value);
      else if (d.type === "error") {
        setError(d.message);
        cancel();
      } else {
        setResultConfig(stamp);
        if (kind === "solve") {
          setCandidates(d.result as Candidate[]);
          setCandidateConfig(configJSON);
          setCandidateModel(model);
        }
        if (
          kind === "coverage" &&
          physicsStamp(
            useStore.getState().config,
            useStore.getState().bounceSettings,
          ) === stamp
        )
          useStore.getState().set({
            coverage: d.result as CoverageCell[],
            heatSpacing: spacing,
          });
        if (
          kind === "coverage" &&
          physicsStamp(
            useStore.getState().config,
            useStore.getState().bounceSettings,
          ) !== stamp
        )
          setError(
            "Coverage finished for an earlier configuration. Run again to display a matching heatmap.",
          );
        if (kind === "monteCarlo") {
          setMC(d.result as MonteCarlo);
          setMCConfig(configJSON);
          setMCModel(model);
        }
        if (kind === "calibrate") {
          setFit(d.result as CalibrationResult);
          setFitMeasurements(measurements);
          setFitConfig(configJSON);
          setFitModel(model);
        }
        setProgress(1);
        cancel();
      }
    };
    job.onerror = (e) => {
      if (worker.current !== job) return;
      setError(e.message);
      cancel();
    };
    job.postMessage({
      kind,
      config,
      ballModel: model,
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
    fitMeasurements,
    parameters,
    setParameters,
    resultConfig,
    candidateConfig,
    mcConfig,
    fitConfig,
    candidateModel,
    mcModel,
    fitModel,
    run,
    cancel,
  };
}
export type AnalysisState = ReturnType<typeof useAnalysis>;
