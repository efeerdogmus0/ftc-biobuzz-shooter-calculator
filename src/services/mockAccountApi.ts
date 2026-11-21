// In-browser mock of the Probot account backend.
//
// - One JSON document in localStorage (`probot-mock-db-v1`): users, robots and
//   the current session. Nothing leaves the browser; there are no passwords.
// - Behaves like a server: async with a small latency, ownership checks,
//   validation of stored scenarios, optimistic concurrency (version) and quotas,
//   so the UI is written against real failure modes.
// - Every robot read back is re-validated with parseScenario, exactly like a
//   file import; a damaged record is reported, never loaded.
import { parseScenario } from "../utils/scenario";
import {
  AccountError,
  ROBOT_SCHEMA,
  type AccountApi,
  type RobotSummary,
  type SaveRobotInput,
  type Session,
  type StoredRobot,
} from "./accountApi";

export const MOCK_DB_KEY = "probot-mock-db-v1";
export const LIMITS = { robotsPerUser: 50, robotBytes: 1024 * 1024 };

interface MockUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}
interface MockDb {
  version: 1;
  users: Record<string, MockUser>;
  robots: Record<string, StoredRobot>;
  session: string | null;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const empty = (): MockDb => ({
  version: 1,
  users: {},
  robots: {},
  session: null,
});
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function newId(prefix: string) {
  const r =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${r}`;
}

export function createMockAccountApi(
  storage: KeyValueStore,
  options: { latencyMs?: number; now?: () => Date } = {},
): AccountApi {
  const latency = options.latencyMs ?? 150;
  const now = () => (options.now?.() ?? new Date()).toISOString();
  const wait = () =>
    latency > 0
      ? new Promise((r) => setTimeout(r, latency))
      : Promise.resolve();

  function load(): MockDb {
    const raw = storage.getItem(MOCK_DB_KEY);
    if (!raw) return empty();
    try {
      const db = JSON.parse(raw) as MockDb;
      if (db?.version !== 1 || typeof db.users !== "object") return empty();
      return db;
    } catch {
      throw new AccountError(
        "UNAVAILABLE",
        "Demo veritabanı okunamadı (bozuk kayıt).",
      );
    }
  }
  function store(db: MockDb) {
    try {
      storage.setItem(MOCK_DB_KEY, JSON.stringify(db));
    } catch {
      throw new AccountError("QUOTA", "Tarayıcı depolama alanı dolu.");
    }
  }
  function me(db: MockDb): MockUser {
    const u = db.session ? db.users[db.session] : undefined;
    if (!u) throw new AccountError("UNAUTHENTICATED", "Giriş yapılmamış.");
    return u;
  }
  const session = (u: MockUser): Session => ({
    user: { id: u.id, email: u.email, displayName: u.displayName },
    mock: true,
  });
  const summary = (r: StoredRobot): RobotSummary => ({
    id: r.id,
    name: r.name,
    summary: r.summary,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  });
  function owned(db: MockDb, id: string) {
    const user = me(db);
    const r = db.robots[id];
    // Someone else's robot is reported exactly like a missing one.
    if (!r || r.ownerId !== user.id)
      throw new AccountError("NOT_FOUND", "Robot bulunamadı.");
    return r;
  }

  return {
    backend: "mock",
    async getSession() {
      await wait();
      const db = load();
      const u = db.session ? db.users[db.session] : undefined;
      return u ? session(u) : null;
    },
    async signIn({ email, displayName }) {
      await wait();
      const e = email.trim().toLowerCase();
      const name = displayName.trim();
      if (!EMAIL.test(e) || e.length > 200)
        throw new AccountError("INVALID", "Geçerli bir e-posta gir.");
      if (!name || name.length > 60)
        throw new AccountError("INVALID", "Bir ad gir (en fazla 60 karakter).");
      const db = load();
      let u = Object.values(db.users).find((x) => x.email === e);
      if (!u) {
        u = { id: newId("usr"), email: e, displayName: name, createdAt: now() };
        db.users[u.id] = u;
      } else u.displayName = name;
      db.session = u.id;
      store(db);
      return session(u);
    },
    async signOut() {
      await wait();
      const db = load();
      db.session = null;
      store(db);
    },
    async listRobots() {
      await wait();
      const db = load();
      const user = me(db);
      return Object.values(db.robots)
        .filter((r) => r.ownerId === user.id)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(summary);
    },
    async getRobot(id) {
      await wait();
      const r = owned(load(), id);
      try {
        return { ...r, scenario: parseScenario(r.scenario) };
      } catch (e) {
        throw new AccountError(
          "INVALID",
          `Kayıtlı robot açılamadı: ${e instanceof Error ? e.message : e}`,
        );
      }
    },
    async saveRobot(input: SaveRobotInput) {
      await wait();
      const db = load();
      const user = me(db);
      const name = input.name.trim();
      if (!name || name.length > 120)
        throw new AccountError("INVALID", "Robot adı 1–120 karakter olmalı.");
      let scenario;
      try {
        scenario = parseScenario(JSON.parse(JSON.stringify(input.scenario)));
      } catch (e) {
        throw new AccountError(
          "INVALID",
          `Senaryo geçersiz: ${e instanceof Error ? e.message : e}`,
        );
      }
      const bytes = new TextEncoder().encode(JSON.stringify(scenario)).length;
      if (bytes > LIMITS.robotBytes)
        throw new AccountError("QUOTA", "Robot kaydı 1 MiB sınırını aşıyor.");
      const t = now();
      if (input.id) {
        const prev = owned(db, input.id);
        if (
          input.baseVersion !== undefined &&
          input.baseVersion !== prev.version
        )
          throw new AccountError(
            "CONFLICT",
            "Bu robot başka bir yerde değiştirilmiş.",
          );
        const next: StoredRobot = {
          ...prev,
          name,
          summary: input.summary,
          scenario,
          version: prev.version + 1,
          updatedAt: t,
        };
        db.robots[prev.id] = next;
        store(db);
        return next;
      }
      const mine = Object.values(db.robots).filter(
        (r) => r.ownerId === user.id,
      );
      if (mine.length >= LIMITS.robotsPerUser)
        throw new AccountError(
          "QUOTA",
          `En fazla ${LIMITS.robotsPerUser} robot kaydedilebilir.`,
        );
      const robot: StoredRobot = {
        id: newId("rbt"),
        ownerId: user.id,
        schema: ROBOT_SCHEMA,
        name,
        summary: input.summary,
        scenario,
        version: 1,
        createdAt: t,
        updatedAt: t,
      };
      db.robots[robot.id] = robot;
      store(db);
      return robot;
    },
    async deleteRobot(id) {
      await wait();
      const db = load();
      owned(db, id);
      delete db.robots[id];
      store(db);
    },
  };
}
