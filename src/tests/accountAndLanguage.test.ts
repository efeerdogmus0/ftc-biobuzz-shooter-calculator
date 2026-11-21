import { describe, expect, it } from "vitest";
import {
  createMockAccountApi,
  LIMITS,
  MOCK_DB_KEY,
} from "../services/mockAccountApi";
import { AccountError } from "../services/accountApi";
import { exampleScenario } from "../utils/scenario";
import { decideLang, translate } from "../i18n";

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    m,
  };
};
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof AccountError ? e.code : "OTHER";
  }
  return "OK";
};

describe("mock account backend", () => {
  it("requires sign-in, then saves, lists, reopens and deletes a robot", async () => {
    const store = memory();
    const api = createMockAccountApi(store, { latencyMs: 0 });
    expect(await api.getSession()).toBeNull();
    expect(await code(api.listRobots())).toBe("UNAUTHENTICATED");
    expect(await code(api.signIn({ email: "nope", displayName: "x" }))).toBe(
      "INVALID",
    );
    const session = await api.signIn({
      email: "Takim@Ornek.com",
      displayName: "Takım 9029",
    });
    expect(session.mock).toBe(true);
    expect(session.user.email).toBe("takim@ornek.com");
    const scenario = exampleScenario();
    const saved = await api.saveRobot({
      name: "Shooter A",
      summary: "twin-wheel · 100 mm · 1400 RPM",
      scenario,
    });
    expect(saved.version).toBe(1);
    expect((await api.listRobots()).map((r) => r.name)).toEqual(["Shooter A"]);
    const back = await api.getRobot(saved.id);
    expect(JSON.stringify(back.scenario.config)).toBe(
      JSON.stringify(scenario.config),
    );
    // Nothing secret is stored: no password field exists.
    expect(store.m.get(MOCK_DB_KEY)).not.toMatch(/password/i);
    await api.deleteRobot(saved.id);
    expect(await api.listRobots()).toEqual([]);
    expect(await code(api.getRobot(saved.id))).toBe("NOT_FOUND");
  });

  it("refuses stale updates (optimistic concurrency) and keeps users apart", async () => {
    const store = memory();
    const api = createMockAccountApi(store, { latencyMs: 0 });
    await api.signIn({ email: "a@x.com", displayName: "A" });
    const r = await api.saveRobot({
      name: "R",
      summary: "",
      scenario: exampleScenario(),
    });
    const v2 = await api.saveRobot({
      id: r.id,
      baseVersion: 1,
      name: "R2",
      summary: "",
      scenario: exampleScenario(),
    });
    expect(v2.version).toBe(2);
    expect(
      await code(
        api.saveRobot({
          id: r.id,
          baseVersion: 1,
          name: "R3",
          summary: "",
          scenario: exampleScenario(),
        }),
      ),
    ).toBe("CONFLICT");
    // Another user (same browser) cannot see or touch A's robot.
    await api.signIn({ email: "b@x.com", displayName: "B" });
    expect(await api.listRobots()).toEqual([]);
    expect(await code(api.getRobot(r.id))).toBe("NOT_FOUND");
    expect(await code(api.deleteRobot(r.id))).toBe("NOT_FOUND");
    await api.signOut();
    expect(await api.getSession()).toBeNull();
  });

  it("validates scenarios and enforces quotas", async () => {
    const api = createMockAccountApi(memory(), { latencyMs: 0 });
    await api.signIn({ email: "q@x.com", displayName: "Q" });
    const bad = exampleScenario();
    (bad.config.shooter.primary as { diameter: number }).diameter = -1;
    expect(
      await code(api.saveRobot({ name: "Bad", summary: "", scenario: bad })),
    ).toBe("INVALID");
    expect(
      await code(
        api.saveRobot({ name: " ", summary: "", scenario: exampleScenario() }),
      ),
    ).toBe("INVALID");
    for (let i = 0; i < LIMITS.robotsPerUser; i++)
      await api.saveRobot({
        name: `R${i}`,
        summary: "",
        scenario: exampleScenario(),
      });
    expect(
      await code(
        api.saveRobot({
          name: "one more",
          summary: "",
          scenario: exampleScenario(),
        }),
      ),
    ).toBe("QUOTA");
  });
});

describe("language choice (Probot Studio convention)", () => {
  const env = { search: "", stored: null, cookie: null, browser: "tr-TR" };
  it("URL ?dil wins, then localStorage probot-dil, then cookie probot_dil, then the browser", () => {
    expect(decideLang({ ...env, search: "?dil=en", stored: "tr" })).toBe("en");
    expect(decideLang({ ...env, search: "?lang=en" })).toBe("en");
    expect(decideLang({ ...env, stored: "en", cookie: "tr" })).toBe("en");
    expect(decideLang({ ...env, cookie: "en" })).toBe("en");
    expect(decideLang({ ...env, browser: "en-US" })).toBe("en");
    expect(decideLang({ ...env, browser: "tr-TR" })).toBe("tr");
    expect(
      decideLang({ ...env, search: "?dil=de", stored: "xx", browser: "de-DE" }),
    ).toBe("en");
  });
  it("translates both ways and falls back to the source text", () => {
    expect(translate("Giriş yap", "en")).toBe("Sign in");
    expect(translate("Sign in", "tr")).toBe("Giriş yap");
    expect(translate("  Giriş yap ", "en")).toBe("  Sign in ");
    expect(translate("bilinmeyen metin", "en")).toBe("bilinmeyen metin");
  });
});
