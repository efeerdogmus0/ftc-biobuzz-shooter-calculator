// Account + saved-robots API contract.
//
// The app talks only to this interface. Today it is backed by an in-browser
// mock (./mockAccountApi.ts). When the simulator moves into probotstudio.com,
// an HTTP implementation against the Probot account backend replaces the mock
// in ./index.ts; nothing else in the UI changes. The REST shape this maps to is
// documented in docs/PROBOT_INTEGRATION_NOTES.md (§ Accounts).
import type { Scenario } from "../utils/scenario";

export const ROBOT_SCHEMA = "pollen-scenario@1" as const;

export interface AccountUser {
  id: string;
  email: string;
  displayName: string;
}

export interface Session {
  user: AccountUser;
  /** True for the in-browser demo backend: no password, data stays on this device. */
  mock: boolean;
}

export interface RobotSummary {
  id: string;
  name: string;
  /** Short mechanism description for lists. */
  summary: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoredRobot extends RobotSummary {
  ownerId: string;
  schema: typeof ROBOT_SCHEMA;
  /** The complete scenario exactly as captureScenario() produced it. */
  scenario: Scenario;
}

export interface SaveRobotInput {
  /** Omit to create; give it to update an existing robot. */
  id?: string;
  name: string;
  summary: string;
  scenario: Scenario;
  /** Optimistic concurrency: the version the client last saw (updates only). */
  baseVersion?: number;
}

export type AccountErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID"
  | "QUOTA"
  | "UNAVAILABLE";

export class AccountError extends Error {
  constructor(
    public code: AccountErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AccountError";
  }
}

export interface AccountApi {
  /** Human-readable backend name, shown in the account menu. */
  readonly backend: "mock" | "probot";
  getSession(): Promise<Session | null>;
  signIn(input: { email: string; displayName: string }): Promise<Session>;
  signOut(): Promise<void>;
  listRobots(): Promise<RobotSummary[]>;
  getRobot(id: string): Promise<StoredRobot>;
  saveRobot(input: SaveRobotInput): Promise<StoredRobot>;
  deleteRobot(id: string): Promise<void>;
}
