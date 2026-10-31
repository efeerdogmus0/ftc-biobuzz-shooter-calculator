// Runs the main shot preview off the UI thread with latest-wins semantics.
// - Idle worker: the request starts immediately (drag/drive stays live).
// - Busy worker: only the newest request waits; the running job finishes if it
//   is young, otherwise it is terminated after `cancelAfterMs` so a slow,
//   superseded job never delays the newest configuration.
// - A result is published only for the newest request (stale-result guard).
// - A job exceeding `budgetMs` is terminated and reported as an error.
import type { Shot } from "../physics/types";

export interface PreviewWorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}
export interface PreviewOutcome {
  id: number;
  shot: Shot | null;
  error: string;
}
export interface PreviewClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
const realClock: PreviewClock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class PreviewScheduler<Request extends object> {
  private latest = 0;
  private worker: PreviewWorkerLike | null = null;
  private running: { id: number; startedAt: number } | null = null;
  private pending: { id: number; request: Request } | null = null;
  private cancelTimer: unknown = null;
  private budgetTimer: unknown = null;

  constructor(
    private readonly create: () => PreviewWorkerLike,
    private readonly publish: (outcome: PreviewOutcome) => void,
    private readonly options = { cancelAfterMs: 150, budgetMs: 20_000 },
    private readonly clock: PreviewClock = realClock,
  ) {}

  /** Queue a request; returns its id. Only the newest id is ever published. */
  request(request: Request): number {
    const id = ++this.latest;
    this.pending = { id, request };
    if (!this.running) {
      this.startPending();
      return id;
    }
    if (this.cancelTimer === null) {
      const elapsed = this.clock.now() - this.running.startedAt;
      this.cancelTimer = this.clock.setTimeout(
        () => {
          this.cancelTimer = null;
          if (this.running && this.pending) {
            this.kill();
            this.startPending();
          }
        },
        Math.max(0, this.options.cancelAfterMs - elapsed),
      );
    }
    return id;
  }

  dispose() {
    this.pending = null;
    this.kill();
  }

  private startPending() {
    const next = this.pending;
    if (!next) return;
    this.pending = null;
    const worker = (this.worker ??= this.spawn());
    this.running = { id: next.id, startedAt: this.clock.now() };
    this.budgetTimer = this.clock.setTimeout(() => {
      this.budgetTimer = null;
      if (this.running?.id !== next.id) return;
      this.kill();
      this.finish({
        id: next.id,
        shot: null,
        error: `Preview exceeded the ${this.options.budgetMs / 1000} s work budget and was stopped. Increase simulation.maxStep or shooter.contactStep, or reduce maxTime/maxContactTime.`,
      });
    }, this.options.budgetMs);
    worker.postMessage({ id: next.id, ...next.request });
  }

  private spawn(): PreviewWorkerLike {
    const worker = this.create();
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as PreviewOutcome;
      if (data.id !== this.running?.id) return;
      this.clearTimers();
      this.running = null;
      this.finish({
        id: data.id,
        shot: data.shot ?? null,
        error: data.error ?? "",
      });
    };
    worker.onerror = (event: ErrorEvent) => {
      const id = this.running?.id;
      this.kill();
      if (id !== undefined)
        this.finish({
          id,
          shot: null,
          error: event.message || "Preview worker failed",
        });
    };
    return worker;
  }

  private finish(outcome: PreviewOutcome) {
    if (outcome.id === this.latest) this.publish(outcome);
    this.startPending();
  }

  private clearTimers() {
    if (this.cancelTimer !== null) this.clock.clearTimeout(this.cancelTimer);
    if (this.budgetTimer !== null) this.clock.clearTimeout(this.budgetTimer);
    this.cancelTimer = null;
    this.budgetTimer = null;
  }

  private kill() {
    this.clearTimers();
    this.worker?.terminate();
    this.worker = null;
    this.running = null;
  }
}
