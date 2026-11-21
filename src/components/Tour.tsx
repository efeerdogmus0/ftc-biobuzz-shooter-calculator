// First-visit tour of the simple layout: a spotlight on one control at a time
// with a short card beside it. Presentation only; it never changes an input.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "../i18n/useT";

export const TOUR_KEY = "pollen-tour-done";

const steps = [
  {
    at: ".scene-canvas",
    title: "1 · Robotu yerine koy",
    text: "Sahadaki robotu tutup atış yapacağın yere sürükle. Tekerlekle yaklaş, boş yerden sürükleyerek sahayı çevir.",
  },
  {
    at: ".solve-card > button",
    title: "2 · Otomatik çöz",
    text: "Bu konumdan isabet eden açıyı ve teker hızını senin yerine bulur, en iyisini robota uygular.",
  },
  {
    at: ".result-card",
    title: "3 · Sonucu oku",
    text: "İsabet mi, ıska mı burada yazar. Açı ve teker hızı, gerçek robotunda ayarlayacağın iki değerdir.",
  },
  {
    at: ".shot-controls > .primary",
    title: "4 · Atış yap",
    text: "Topun uçuşunu sahada izle. İstersen yanındaki hız kutusundan ağır çekime al.",
  },
  {
    at: ".journey-rail",
    title: "5 · Yol haritan",
    text: "Soldan sağa altı adım: robotunu tanıt, atışı bul, sahayı tara, güvenilirliği ölç, otonomu planla, sayıları robota aktar. İstediğin adıma tıkla.",
  },
] as const;

export function tourSeen() {
  try {
    return !!localStorage.getItem(TOUR_KEY);
  } catch {
    return true; // no storage: do not nag on every visit
  }
}

export function Tour({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [i, setI] = useState(0);
  const [box, setBox] = useState<DOMRect | null>(null);
  const next = useRef<HTMLButtonElement>(null);
  const step = steps[i];
  const last = i === steps.length - 1;
  const finish = () => {
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
      // storage blocked: the tour simply shows again next visit
    }
    onDone();
  };
  useLayoutEffect(() => {
    const el = document.querySelector<HTMLElement>(step.at);
    if (!el) {
      setBox(null);
      return;
    }
    el.scrollIntoView({ block: "center", inline: "nearest" });
    const measure = () => setBox(el.getBoundingClientRect());
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    next.current?.focus({ preventScroll: true });
    return () => {
      watch.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight")
        setI((n) => Math.min(n + 1, steps.length - 1));
      else if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const vw = window.innerWidth,
    vh = window.innerHeight,
    W = Math.min(340, vw - 24),
    gap = 18;
  const card: React.CSSProperties = { width: W };
  if (!box) {
    card.left = (vw - W) / 2;
    card.top = vh / 3;
  } else {
    const low = box.top + box.height / 2 > vh / 2;
    if (vw < 700) {
      // Phone: a sheet on the half of the screen the target is not in.
      card.left = (vw - W) / 2;
      if (low) card.top = 12;
      else card.bottom = 12;
    } else if (box.width > vw * 0.45) {
      // A big target (the field): sit inside it, near its lower left.
      card.left = box.left + 28;
      card.bottom = Math.max(vh - box.bottom + 70, 12);
    } else {
      if (box.left >= W + gap + 12) card.left = box.left - W - gap;
      else if (vw - box.right >= W + gap + 12) card.left = box.right + gap;
      else card.left = Math.min(Math.max(box.left, 12), vw - W - 12);
      const beside = card.left + W <= box.left || card.left >= box.right;
      if (beside) {
        if (low) card.bottom = Math.max(vh - box.bottom - 6, 12);
        else card.top = Math.max(box.top - 6, 12);
      } else if (low) card.bottom = vh - box.top + gap;
      else card.top = box.bottom + gap;
    }
  }
  return (
    <div
      className="tour"
      role="dialog"
      aria-modal="true"
      aria-label={t("Hızlı tur")}
    >
      {box && (
        <div
          className="tour-spot"
          style={{
            left: Math.max(box.left - 6, 2),
            top: Math.max(box.top - 6, 2),
            width: Math.min(box.width + 12, vw - 4),
            height: Math.min(box.height + 12, vh - 4),
          }}
        />
      )}
      <div className={`tour-card ${box ? "" : "plain"}`} style={card}>
        <b>{t(step.title)}</b>
        <p>{t(step.text)}</p>
        <div className="tour-foot">
          <span className="tour-dots" aria-hidden="true">
            {steps.map((_, n) => (
              <i key={n} className={n === i ? "on" : ""} />
            ))}
          </span>
          <button className="tour-skip" onClick={finish}>
            {t("Turu geç")}
          </button>
          {i > 0 && <button onClick={() => setI(i - 1)}>{t("Geri")}</button>}
          <button
            ref={next}
            className="primary"
            onClick={() => (last ? finish() : setI(i + 1))}
          >
            {t(last ? "Başla" : "Devam")}
          </button>
        </div>
      </div>
    </div>
  );
}
