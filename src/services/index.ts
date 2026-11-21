// The single swap point for the account backend (see docs/PROBOT_INTEGRATION_NOTES.md).
// Today: the in-browser mock. On probotstudio.com: an HTTP client for the
// Probot account API implementing the same AccountApi interface.
import type { AccountApi } from "./accountApi";
import { createMockAccountApi } from "./mockAccountApi";

const memory = new Map<string, string>();
const storage =
  typeof localStorage !== "undefined"
    ? localStorage
    : {
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => void memory.set(k, v),
      };

export const accountApi: AccountApi = createMockAccountApi(storage);
export * from "./accountApi";
