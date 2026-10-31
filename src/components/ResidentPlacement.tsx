import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import type { Vec3 } from "../physics/types";
import { targetLocal, targetOpeningTop } from "../physics/flight";
import {
  ballColors,
  placementError,
  residentPositions,
} from "../physics/collisionWorld";
import { clamp } from "../physics/math";
export function ResidentPlacement() {
  const s = useStore(),
    c = s.config,
    t = c.field.target,
    r = c.projectile.diameter / 2;
  const [selected, setSelected] = useState(0),
    [draft, setDraft] = useState<Vec3[]>([]),
    [error, setError] = useState("");
  const current = useRef<Vec3[]>([]),
    dragging = useRef(false);
  useEffect(() => {
    const points =
      s.manualResidents.length >= s.residentCount
        ? s.manualResidents.slice(0, s.residentCount)
        : residentPositions(c, s.residentCount, "center").map((p) =>
            targetLocal(p, t),
          );
    current.current = structuredClone(points);
    setDraft(current.current);
    setError("");
  }, [s.manualResidents, s.residentCount, c, t]);
  const commit = () => {
    const reason = placementError(c, current.current);
    if (reason) {
      current.current = structuredClone(
        s.manualResidents.slice(0, s.residentCount),
      );
      setDraft(current.current);
      setError(reason);
      return;
    }
    s.set({
      manualResidents: structuredClone(current.current),
      residentLayout: "manual",
      playing: false,
      playReset: s.playReset + 1,
      selectedBounce: 0,
    });
    setError("");
  };
  const move = (index: number, position: Vec3) => {
    current.current = current.current.map((p, i) =>
      i === index ? position : p,
    );
    setDraft([...current.current]);
    setError(placementError(c, current.current) ?? "");
  };
  const width = 460,
    scale = width / t.width,
    height = t.depth * scale,
    index = Math.min(selected, Math.max(0, draft.length - 1)),
    point = draft[index];
  return (
    <div className="resident-placement">
      <strong>Topları kendin yerleştir</strong>
      <p>
        Üstten görünüm: topları sürükle. Bırakınca yerçekimiyle oturtup atışı
        yeniden hesaplar. Bu görünüm yalnızca başlangıç konumlarını gösterir.
      </p>
      <svg
        viewBox={`0 0 500 ${height + 55}`}
        aria-label="CELL içindeki topların başlangıç yerleşimi"
        role="group"
        onPointerMove={(e) => {
          if (!dragging.current || !point) return;
          const bounds = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - bounds.left) / bounds.width) * 500;
          const y = ((e.clientY - bounds.top) / bounds.height) * (height + 55);
          move(index, [
            clamp((x - 250) / scale, -t.width / 2 + r, t.width / 2 - r),
            point[1],
            clamp(-(y - 20) / scale, -t.depth + r, -r),
          ]);
        }}
        onPointerUp={() => {
          if (dragging.current) {
            dragging.current = false;
            commit();
          }
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      >
        <rect
          x="20"
          y="20"
          width={width}
          height={height}
          fill="#13252b"
          stroke="#66b7ad"
          strokeWidth="2"
        />
        <text x="250" y="14" textAnchor="middle">
          GİRİŞ
        </text>
        <text x="250" y={height + 44} textAnchor="middle">
          ARKA TABAN
        </text>
        {draft.map((p, i) => (
          <g
            key={i}
            role="button"
            tabIndex={0}
            aria-label={`Top ${i + 1} yerleşimi`}
            onPointerDown={(e) => {
              e.preventDefault();
              setSelected(i);
              dragging.current = true;
              e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
            }}
            onKeyDown={(e) => {
              if (
                !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                  e.key,
                )
              )
                return;
              e.preventDefault();
              setSelected(i);
              const q = [...p] as Vec3;
              if (e.key === "ArrowLeft") q[0] -= 0.002;
              if (e.key === "ArrowRight") q[0] += 0.002;
              if (e.key === "ArrowUp") q[2] += 0.002;
              if (e.key === "ArrowDown") q[2] -= 0.002;
              move(i, q);
              commit();
            }}
          >
            <circle
              cx={250 + p[0] * scale}
              cy={20 - p[2] * scale}
              r={r * scale}
              fill={ballColors[i + 1]}
              fillOpacity="0.8"
              stroke={i === index ? (error ? "#ff8a8a" : "#ffffff") : "#102128"}
              strokeWidth={i === index ? 3 : 1}
            />
            <text
              x={250 + p[0] * scale}
              y={25 - p[2] * scale}
              textAnchor="middle"
              fill="#14282f"
              fontSize="18"
            >
              {i + 1}
            </text>
          </g>
        ))}
      </svg>
      {point && (
        <>
          <div className="placement-select">
            {draft.map((_, i) => (
              <button
                key={i}
                aria-pressed={i === index}
                onClick={() => setSelected(i)}
              >
                Top {i + 1}
              </button>
            ))}
          </div>
          <label>
            Seçili topun alt kenardan yüksekliği{" "}
            <output>
              {Math.round((point[1] + t.height / 2 - r) * 1000)} mm
            </output>
            <input
              aria-label="Seçili topun yüksekliği"
              type="range"
              min="0"
              max={Math.max(
                0,
                (targetOpeningTop(t, point[0]) - r + t.height / 2 - r) * 1000,
              )}
              step="1"
              value={(point[1] + t.height / 2 - r) * 1000}
              onChange={(e) =>
                move(index, [
                  point[0],
                  -t.height / 2 + r + Number(e.target.value) / 1000,
                  point[2],
                ])
              }
              onPointerUp={commit}
              onKeyUp={commit}
            />
          </label>
          <button className="placement-apply" onClick={commit}>
            Yerleşimi uygula ve oturt
          </button>
        </>
      )}
      {error && (
        <p className="placement-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
