/** Dormand–Prince embedded 5(4). Per-component absolute + relative error control.
 * No render-frame dependency. Caller limits maxStep for collision chord accuracy. */
export type Derivative = (t: number, y: number[]) => number[];
const A = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
];
const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const B = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
const E = [
  35 / 384 - 5179 / 57600,
  0,
  500 / 1113 - 7571 / 16695,
  125 / 192 - 393 / 640,
  -2187 / 6784 + 92097 / 339200,
  11 / 84 - 187 / 2100,
  -1 / 40,
];
export function rkStep(f: Derivative, t: number, y: number[], h: number) {
  const k: number[][] = [];
  for (let i = 0; i < 7; i++)
    k.push(
      f(
        t + C[i] * h,
        y.map((v, j) => v + h * A[i].reduce((s, a, n) => s + a * k[n][j], 0)),
      ),
    );
  return {
    y: y.map((v, j) => v + h * B.reduce((s, b, n) => s + b * k[n][j], 0)),
    error: y.map((_, j) => h * E.reduce((s, b, n) => s + b * k[n][j], 0)),
  };
}
export function integrate(
  f: Derivative,
  y0: number[],
  end: number,
  abs = 1e-8,
  rel = 1e-7,
  maxStep = 0.01,
  stop?: (t: number, y: number[]) => boolean,
) {
  const out = [{ t: 0, y: [...y0] }];
  let t = 0,
    y = [...y0],
    h = Math.min(0.005, maxStep);
  let attempts = 0;
  while (t < end) {
    if (++attempts > 200000)
      throw new Error(
        "Integrator step budget exceeded; check physical parameters.",
      );
    h = Math.min(h, end - t, maxStep);
    const step = rkStep(f, t, y, h);
    const error = Math.max(
      ...step.error.map(
        (e, j) =>
          Math.abs(e) /
          (abs + rel * Math.max(Math.abs(y[j]), Math.abs(step.y[j]))),
      ),
    );
    if (!Number.isFinite(error))
      throw new Error("Non-finite flight state; check configuration.");
    if (error <= 1) {
      t += h;
      y = step.y;
      out.push({ t, y });
      if (stop?.(t, y)) break;
    }
    h *=
      error === 0 ? 5 : Math.max(0.1, Math.min(5, 0.9 * Math.pow(error, -0.2)));
    if (h < 1e-10) throw new Error("Integrator cannot meet tolerance.");
  }
  return out;
}
