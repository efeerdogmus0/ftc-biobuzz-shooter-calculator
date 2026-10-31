import { describe, expect, it } from "vitest";
import {
  PreviewScheduler,
  type PreviewClock,
  type PreviewOutcome,
  type PreviewWorkerLike,
} from "../app/previewScheduler";
import { consumeResetRequest, ACTIVE_KEY } from "../app/recovery";

class FakeClock implements PreviewClock {
  t = 0;
  private timers: { at: number; fn: () => void; handle: number }[] = [];
  private next = 1;
  now = () => this.t;
  setTimeout = (fn: () => void, ms: number) => {
    const handle = this.next++;
    this.timers.push({ at: this.t + ms, fn, handle });
    return handle;
  };
  clearTimeout = (handle: unknown) => {
    this.timers = this.timers.filter((x) => x.handle !== handle);
  };
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at);
      const due = this.timers[0];
      if (!due || due.at > end) break;
      this.timers.shift();
      this.t = due.at;
      due.fn();
    }
    this.t = end;
  }
}

class FakeWorker implements PreviewWorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: { id: number; value: number }[] = [];
  terminated = false;
  postMessage(message: unknown) {
    this.posted.push(message as { id: number; value: number });
  }
  terminate() {
    this.terminated = true;
  }
  reply(id: number, error = "") {
    this.onmessage?.({
      data: { id, shot: error ? null : { id }, error },
    } as MessageEvent);
  }
}

function setup(options = { cancelAfterMs: 150, budgetMs: 20_000 }) {
  const clock = new FakeClock();
  const workers: FakeWorker[] = [];
  const published: PreviewOutcome[] = [];
  const scheduler = new PreviewScheduler<{ value: number }>(
    () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    },
    (o) => published.push(o),
    options,
    clock,
  );
  return { clock, workers, published, scheduler };
}

describe("preview scheduler", () => {
  it("starts an idle request immediately and publishes its result", () => {
    const { workers, published, scheduler } = setup();
    const id = scheduler.request({ value: 1 });
    expect(workers[0].posted).toEqual([{ id, value: 1 }]);
    workers[0].reply(id);
    expect(published.map((o) => o.id)).toEqual([id]);
  });

  it("never publishes a superseded result and runs only the newest queued request", () => {
    const { workers, published, scheduler } = setup();
    const a = scheduler.request({ value: 1 });
    scheduler.request({ value: 2 });
    const c = scheduler.request({ value: 3 });
    workers[0].reply(a); // finishes young: no termination, but stale
    expect(published).toEqual([]);
    expect(workers[0].posted.map((p) => p.value)).toEqual([1, 3]);
    workers[0].reply(c);
    expect(published.map((o) => o.id)).toEqual([c]);
  });

  it("terminates a slow superseded job instead of waiting for it", () => {
    const { clock, workers, published, scheduler } = setup();
    scheduler.request({ value: 1 });
    clock.advance(100);
    const b = scheduler.request({ value: 2 });
    clock.advance(49);
    expect(workers[0].terminated).toBe(false);
    clock.advance(1); // 150 ms after the first job started
    expect(workers[0].terminated).toBe(true);
    expect(workers[1].posted.map((p) => p.value)).toEqual([2]);
    workers[1].reply(b);
    expect(published.map((o) => o.id)).toEqual([b]);
  });

  it("stops a job that exceeds the work budget and reports it", () => {
    const { clock, workers, published, scheduler } = setup({
      cancelAfterMs: 150,
      budgetMs: 1000,
    });
    const id = scheduler.request({ value: 1 });
    clock.advance(1000);
    expect(workers[0].terminated).toBe(true);
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ id, shot: null });
    expect(published[0].error).toMatch(/work budget/);
    // a late message from the killed worker is ignored
    workers[0].reply(id);
    expect(published).toHaveLength(1);
  });

  it("reports worker crashes for the newest request and recovers with a new worker", () => {
    const { workers, published, scheduler } = setup();
    const a = scheduler.request({ value: 1 });
    workers[0].onerror?.({ message: "boom" } as ErrorEvent);
    expect(published).toEqual([{ id: a, shot: null, error: "boom" }]);
    const b = scheduler.request({ value: 2 });
    expect(workers[1].posted).toEqual([{ id: b, value: 2 }]);
  });

  it("dispose terminates the worker and drops queued work", () => {
    const { workers, published, scheduler } = setup();
    const a = scheduler.request({ value: 1 });
    scheduler.request({ value: 2 });
    scheduler.dispose();
    expect(workers[0].terminated).toBe(true);
    workers[0].reply(a);
    expect(published).toEqual([]);
  });
});

describe("startup reset", () => {
  function memoryStorage(entries: Record<string, string>) {
    const map = new Map(Object.entries(entries));
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      map,
    } as unknown as Storage & { map: Map<string, string> };
  }
  const loc = (search: string, hash = "") =>
    ({ search, hash, pathname: "/repo/" }) as Location;

  it("clears only the active scenario, keeps profiles and strips the flag", () => {
    const storage = memoryStorage({
      [ACTIVE_KEY]: "{bad",
      "pollen-profiles": "[1]",
    });
    const urls: string[] = [];
    const history = {
      replaceState: (_s: unknown, _t: string, url: string) =>
        void urls.push(url),
    } as unknown as History;
    expect(consumeResetRequest(loc("?reset&x=1"), storage, history)).toBe(true);
    expect(storage.map.has(ACTIVE_KEY)).toBe(false);
    expect(storage.map.get("pollen-profiles")).toBe("[1]");
    expect(urls).toEqual(["/repo/?x=1"]);
    expect(
      consumeResetRequest(loc("", "#reset"), memoryStorage({}), history),
    ).toBe(true);
    expect(urls.at(-1)).toBe("/repo/");
  });

  it("does nothing without the flag", () => {
    const storage = memoryStorage({ [ACTIVE_KEY]: "{}" });
    expect(consumeResetRequest(loc("?x=1"), storage)).toBe(false);
    expect(storage.map.has(ACTIVE_KEY)).toBe(true);
  });
});
