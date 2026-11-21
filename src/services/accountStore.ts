// UI state for the account: session, the user's robot list and which account
// robot is open (so "Kaydet" updates it instead of creating a copy).
import { create } from "zustand";
import { inferSpec } from "../presets/factory";
import type { Scenario } from "../utils/scenario";
import { useStore } from "../state/store";
import { accountApi, AccountError, type RobotSummary, type Session } from ".";

interface AccountState {
  ready: boolean;
  session: Session | null;
  robots: RobotSummary[];
  busy: boolean;
  /**
   * Account robot loaded in the simulator, the version last seen and the
   * simulator's scenarioId at that moment. Loading any other scenario changes
   * scenarioId, so "save" can never overwrite this record by mistake.
   */
  open: { id: string; version: number; scenarioId: number } | null;
  init: () => Promise<void>;
  signIn: (email: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Saves the scenario; updates the open robot unless `asNew`. */
  save: (scenario: Scenario, asNew?: boolean) => Promise<"created" | "updated">;
  /** Fetches a robot; call `attach` after the scenario is on screen. */
  load: (
    id: string,
  ) => Promise<Scenario & { accountId: string; accountVersion: number }>;
  attach: (id: string, version: number) => void;
  remove: (id: string) => Promise<void>;
  /** The simulator switched to a robot that is not (or no longer) the open account robot. */
  detach: () => void;
}

const scenarioId = () => useStore.getState().scenarioId;
/** The open account robot, if it is still the one on screen. */
export function openAccountRobot(s: { open: AccountState["open"] }) {
  return s.open && s.open.scenarioId === scenarioId() ? s.open : null;
}

/** Language-neutral one-line description for robot lists. */
export function robotSummary(s: Scenario) {
  const spec = inferSpec(s.config);
  const d = (s.config.shooter.primary.diameter * 1000).toFixed(0);
  const r = ((s.config.shooter.primary.omega * 30) / Math.PI).toFixed(0);
  return `${spec?.mechanism ?? "compound"} · ${d} mm · ${r} RPM`;
}

export const useAccount = create<AccountState>((set, get) => ({
  ready: false,
  session: null,
  robots: [],
  busy: false,
  open: null,
  async init() {
    try {
      const session = await accountApi.getSession();
      set({ session, ready: true });
      if (session) await get().refresh();
    } catch {
      set({ ready: true, session: null });
    }
  },
  async signIn(email, displayName) {
    set({ busy: true });
    try {
      const session = await accountApi.signIn({ email, displayName });
      set({ session });
      await get().refresh();
    } finally {
      set({ busy: false });
    }
  },
  async signOut() {
    await accountApi.signOut();
    set({ session: null, robots: [], open: null });
  },
  async refresh() {
    if (!get().session) return;
    set({ robots: await accountApi.listRobots() });
  },
  async save(scenario, asNew = false) {
    const open = asNew ? null : openAccountRobot(get());
    set({ busy: true });
    try {
      const saved = await accountApi.saveRobot({
        ...(open ? { id: open.id, baseVersion: open.version } : {}),
        name: scenario.config.name,
        summary: robotSummary(scenario),
        scenario,
      });
      set({
        open: {
          id: saved.id,
          version: saved.version,
          scenarioId: scenarioId(),
        },
      });
      await get().refresh();
      return open ? "updated" : "created";
    } catch (e) {
      // The open robot vanished (deleted elsewhere): forget it, the caller may save as new.
      if (e instanceof AccountError && e.code === "NOT_FOUND")
        set({ open: null });
      throw e;
    } finally {
      set({ busy: false });
    }
  },
  async load(id) {
    const r = await accountApi.getRobot(id);
    return { ...r.scenario, accountId: r.id, accountVersion: r.version };
  },
  attach(id, version) {
    set({ open: { id, version, scenarioId: scenarioId() } });
  },
  async remove(id) {
    await accountApi.deleteRobot(id);
    if (get().open?.id === id) set({ open: null });
    await get().refresh();
  },
  detach() {
    set({ open: null });
  },
}));
