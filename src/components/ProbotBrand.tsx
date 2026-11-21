import { useStore } from "../state/store";
import type { Lang } from "../i18n";
// Probot Studio brand mark, copied from the official site's inline SVG
// (probotstudio.com); white body + orange face on the 150° amber→orange tile.
export function ProbotMark({ size = 26 }: { size?: number }) {
  return (
    <span
      className="probot-mark"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="270 195 520 690">
        <g className="body">
          <rect x="355" y="294" width="109" height="581" rx="54" />
          <rect x="355" y="294" width="376" height="353" rx="64" />
          <circle cx="337" cy="505" r="45" />
          <circle cx="743" cy="505" r="45" />
        </g>
        <g className="face">
          <circle cx="466" cy="468" r="34" />
          <circle cx="614" cy="468" r="34" />
          <path
            d="M500 520 Q520 548 550 530"
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      </svg>
    </span>
  );
}

const SITE = "https://probotstudio.com";
// Same navigation as the Probot Builder header (probotstudio.com/builder, read
// 1 Nov 2026), per language. "tools" is current: this simulator is a tool.
const links: Record<Lang, [id: string, label: string, href: string][]> = {
  tr: [
    ["home", "Ana sayfa", `${SITE}/`],
    ["shop", "Mağaza", `${SITE}/shop/`],
    ["tools", "Araçlar", `${SITE}/araclar/`],
    ["learn", "Eğitim", `${SITE}/egitim/`],
    ["docs", "Dokümanlar", `${SITE}/docs/`],
    ["about", "Hakkımızda", `${SITE}/hakkimizda/`],
  ],
  en: [
    ["home", "Home", `${SITE}/en/`],
    ["shop", "Shop", `${SITE}/shop/?dil=en`],
    ["tools", "Tools", `${SITE}/en/araclar/`],
    ["learn", "Learn", `${SITE}/en/egitim/`],
    ["docs", "Docs", `${SITE}/docs/`],
    ["about", "About us", `${SITE}/en/hakkimizda/`],
  ],
};

export function ProbotBrand() {
  const lang = useStore((s) => s.lang);
  return (
    <a
      className="probot-brand"
      href={lang === "en" ? `${SITE}/en/` : `${SITE}/`}
      target="_blank"
      rel="noreferrer"
      title={lang === "en" ? "Probot Studio home" : "Probot Studio ana sayfa"}
    >
      <ProbotMark />
      <span className="probot-name">Probot Studio</span>
      <span className="probot-badge">SHOOTER</span>
    </a>
  );
}

export function ProbotNav() {
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const other: Lang = lang === "en" ? "tr" : "en";
  return (
    <nav className="probot-nav" aria-label="Probot Studio">
      {links[lang].map(([id, label, href]) => (
        <a
          key={id}
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-current={id === "tools" ? "page" : undefined}
        >
          {label}
        </a>
      ))}
      {/* Like Probot's `dil-sec` link: switches language and remembers it. */}
      <a
        className="dil-sec"
        href={`?dil=${other}`}
        lang={other}
        title={other === "en" ? "Switch to English" : "Türkçeye geç"}
        onClick={(e) => {
          e.preventDefault();
          setLang(other);
        }}
      >
        {other.toUpperCase()}
      </a>
    </nav>
  );
}
