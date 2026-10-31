// Recovery paths that never touch named profiles (`pollen-profiles`).
export const ACTIVE_KEY = "pollen-active";

/** `?reset` or `#reset` in the URL discards the active scenario before the store loads it. */
export function consumeResetRequest(
  location: Location,
  storage: Storage,
  history?: History,
) {
  const params = new URLSearchParams(location.search);
  const requested = params.has("reset") || location.hash === "#reset";
  if (!requested) return false;
  storage.removeItem(ACTIVE_KEY);
  params.delete("reset");
  const search = params.toString();
  history?.replaceState(
    null,
    "",
    `${location.pathname}${search ? `?${search}` : ""}${location.hash === "#reset" ? "" : location.hash}`,
  );
  return true;
}

export function clearActiveScenario(storage: Storage) {
  storage.removeItem(ACTIVE_KEY);
}

/** Raw saved JSON, exported as-is so a scenario that crashes the UI can still be recovered. */
export function activeScenarioText(storage: Storage) {
  return storage.getItem(ACTIVE_KEY);
}
