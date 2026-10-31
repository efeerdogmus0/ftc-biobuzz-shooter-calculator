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
// Probot Studio tools named by the coordinator from the live site; opened in a new tab.
const links: [string, string][] = [
  ["Araçlar", `${SITE}/araclar/`],
  ["Sim", `${SITE}/sim/`],
  ["Builder", `${SITE}/builder/`],
  ["Blocks", `${SITE}/blocks/`],
  ["Eğitim", `${SITE}/egitim/`],
  ["Dokümanlar", `${SITE}/docs/`],
];

export function ProbotBrand() {
  return (
    <a
      className="probot-brand"
      href={`${SITE}/`}
      target="_blank"
      rel="noreferrer"
      title="Probot Studio ana sayfa"
    >
      <ProbotMark />
      <span className="probot-name">Probot Studio</span>
      <span className="probot-badge">SHOOTER</span>
    </a>
  );
}

export function ProbotNav() {
  return (
    <nav className="probot-nav" aria-label="Probot Studio">
      {links.map(([label, href]) => (
        <a key={href} href={href} target="_blank" rel="noreferrer">
          {label}
        </a>
      ))}
    </nav>
  );
}
