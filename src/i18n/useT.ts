import { useCallback } from "react";
import { useStore } from "../state/store";
import { tf, translate } from ".";

/** Translator bound to the active language; components re-render on change. */
export function useT() {
  const lang = useStore((s) => s.lang);
  const t = useCallback((text: string) => translate(text, lang), [lang]);
  const f = useCallback(
    (template: string, values: Record<string, string | number>) =>
      tf(template, values, lang),
    [lang],
  );
  return Object.assign(t, { f, lang });
}
