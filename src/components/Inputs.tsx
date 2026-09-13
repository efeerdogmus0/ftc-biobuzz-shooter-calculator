import { useStore } from "../state/store";
import { getPath } from "../utils/config";
export type Unit = "angle" | "rpm" | "length" | "diameter" | "mass" | "none";
export function unitInfo(kind: Unit, si: boolean): [number, string] {
  if (si)
    return kind === "angle"
      ? [1, "rad"]
      : kind === "rpm"
        ? [1, "rad/s"]
        : kind === "mass"
          ? [1, "kg"]
          : kind === "none"
            ? [1, ""]
            : [1, "m"];
  return kind === "angle"
    ? [180 / Math.PI, "°"]
    : kind === "rpm"
      ? [60 / (2 * Math.PI), "RPM"]
      : kind === "mass"
        ? [1000, "g"]
        : kind === "diameter"
          ? [1000, "mm"]
          : kind === "length"
            ? [1, "m"]
            : [1, ""];
}
interface NumberProps {
  label: string;
  path?: string;
  value?: number;
  onChange?: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  kind?: Unit;
  unit?: string;
  tip?: string;
  slider?: boolean;
}
export function NumberInput({
  label,
  path,
  value,
  onChange,
  min = 0,
  max = 100,
  step,
  kind = "none",
  unit,
  tip,
  slider = true,
}: NumberProps) {
  const c = useStore((s) => s.config),
    units = useStore((s) => s.units),
    edit = useStore((s) => s.edit);
  const [factor, suffix] = unitInfo(kind, units === "SI");
  const v = path ? (getPath(c, path) as number) : (value ?? 0);
  const change = (n: number) => {
    if (!Number.isFinite(n)) return;
    const next = Math.min(max, Math.max(min, n / factor));
    if (path) edit(path, next);
    else onChange?.(next);
  };
  const increment = step
    ? step * factor
    : kind === "angle"
      ? 0.1
      : kind === "rpm"
        ? 1
        : kind === "mass"
          ? 0.1
          : kind === "diameter"
            ? 0.1
            : 0.01;
  return (
    <div className="number-control" title={tip}>
      <label>{label}</label>
      <div className="number-value">
        <input
          aria-label={label}
          type="number"
          value={Number((v * factor).toFixed(5))}
          min={min * factor}
          max={max * factor}
          step={increment}
          onChange={(e) => change(e.target.valueAsNumber)}
        />
        <span>{unit ?? suffix}</span>
      </div>
      {slider && (
        <input
          aria-label={`${label} slider`}
          type="range"
          min={min * factor}
          max={max * factor}
          step={increment}
          value={v * factor}
          onChange={(e) => change(Number(e.target.value))}
        />
      )}
    </div>
  );
}
export function Select({
  label,
  path,
  options,
}: {
  label: string;
  path: string;
  options: [string, string][];
}) {
  const value = useStore((s) => getPath(s.config, path)),
    edit = useStore((s) => s.edit);
  return (
    <label className="select-control">
      {label}
      <select
        aria-label={label}
        value={String(value)}
        onChange={(e) => edit(path, e.target.value)}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
export function Section({
  title,
  children,
  open = false,
}: {
  title: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details className="section" open={open}>
      <summary>
        {title}
        <span>+</span>
      </summary>
      <div className="section-content">{children}</div>
    </details>
  );
}
