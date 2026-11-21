// TR / EN, following the Probot Studio site convention (see
// docs/PROBOT_INTEGRATION_NOTES.md):
//   1. `?dil=en|tr` in the URL wins, is stored, then removed from the address;
//   2. otherwise the stored choice: localStorage `probot-dil` or cookie `probot_dil`
//      (both written by probotstudio.com, so on the same origin a visitor who
//      chose EN there opens this tool in EN);
//   3. otherwise the browser language (tr* → tr, anything else → en).
//
// Strings in the code are written once, in either Turkish or English. The
// dictionaries in ./dict hold [tr, en] pairs; `translate` returns the version
// for the active language and falls back to the source text.
import { dictionaries } from "./dict";

export type Lang = "tr" | "en";
export const LANG_KEY = "probot-dil";
export const LANG_COOKIE = "probot_dil";

const toEn = new Map<string, string>();
const toTr = new Map<string, string>();
for (const [rawTr, rawEn] of dictionaries.flat()) {
  const tr = rawTr.trim(),
    en = rawEn.trim();
  if (!toEn.has(tr)) toEn.set(tr, en);
  if (!toTr.has(en)) toTr.set(en, tr);
}

let current: Lang = "tr";
const listeners = new Set<(l: Lang) => void>();

export function getLang() {
  return current;
}

export function translate(text: string, lang: Lang = current): string {
  if (!text) return text;
  const trimmed = text.trim();
  const hit = lang === "en" ? toEn.get(trimmed) : toTr.get(trimmed);
  if (hit === undefined) return text;
  // Keep surrounding whitespace of JSX text nodes.
  return text.replace(trimmed, hit);
}

/** Template helper: `tf("{n} robot", { n: 3 })`, the template itself is translated. */
export function tf(
  template: string,
  values: Record<string, string | number>,
  lang: Lang = current,
) {
  return translate(template, lang).replace(/\{(\w+)\}/g, (_, k) =>
    k in values ? String(values[k]) : `{${k}}`,
  );
}

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
const valid = (v: unknown): v is Lang => v === "tr" || v === "en";

export interface LangEnv {
  search: string;
  stored: string | null;
  cookie: string | null;
  browser: string | undefined;
}

/** Pure decision, testable without a browser. */
export function decideLang(env: LangEnv): Lang {
  const q = new URLSearchParams(env.search);
  const fromUrl = q.get("dil") ?? q.get("lang");
  if (valid(fromUrl)) return fromUrl;
  if (valid(env.stored)) return env.stored;
  if (valid(env.cookie)) return env.cookie;
  return env.browser?.toLowerCase().startsWith("tr") ? "tr" : "en";
}

export function detectLang(): Lang {
  try {
    return decideLang({
      search: typeof location !== "undefined" ? location.search : "",
      stored:
        typeof localStorage !== "undefined"
          ? localStorage.getItem(LANG_KEY)
          : null,
      cookie: readCookie(LANG_COOKIE),
      browser: typeof navigator !== "undefined" ? navigator.language : "tr",
    });
  } catch {
    return "tr";
  }
}

/** Applies a language: memory, storage, cookie, <html lang>, and cleans `?dil=`. */
export function setLang(lang: Lang) {
  current = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* preference only */
  }
  try {
    document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; SameSite=Lax`;
    document.documentElement.lang = lang;
    document.title =
      lang === "en"
        ? "Probot Shooter · POLLEN shot simulator"
        : "Probot Shooter · POLLEN atış simülatörü";
    const url = new URL(location.href);
    if (url.searchParams.has("dil") || url.searchParams.has("lang")) {
      url.searchParams.delete("dil");
      url.searchParams.delete("lang");
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  } catch {
    /* no DOM (tests) */
  }
  listeners.forEach((f) => f(lang));
}

export function onLangChange(f: (l: Lang) => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}
