import { ContactPhysics } from "./ContactPhysics";
import { DynamicWorldControls } from "./DynamicWorldControls";
import { ResidentPlacement } from "./ResidentPlacement";
import { residentPositions } from "../physics/collisionWorld";
import { targetLocal, sampleAt } from "../physics/flight";
import { useStore } from "../state/store";
import type { Shot } from "../physics/types";
import { norm, dot, sub, scale } from "../physics/math";
import { shotKineticEnergy } from "../physics/launchDynamics";
import {
  trajectorySegments,
  surfaceNames,
  bouncePalette,
} from "../utils/bounceView";
export function BounceControls({ shot }: { shot: Shot }) {
  const s = useStore(),
    f = shot.flight,
    events = f.bounces ?? [];
  if (!shot.shooter.exited)
    return (
      <p role="alert" className="notice">
        Top shooter’dan çıkamadı; uçuş ve sekiş hesaplanmadı. Shooter
        sekmesindeki temas ayarlarını düzeltip tekrar dene.
      </p>
    );
  const selected = Math.min(s.selectedBounce, Math.max(0, events.length - 1)),
    event = events[selected];
  const seek = (time: number, index = selected) =>
    s.set({
      playing: false,
      selectedBounce: index,
      seekTime: time,
      seekTick: s.seekTick + 1,
      showTrajectory: true,
    });
  const changeScenario = (state: Partial<typeof s>) =>
    s.set({
      ...state,
      playing: false,
      playReset: s.playReset + 1,
      selectedBounce: 0,
      showTrajectory: true,
    });
  const energy = (v: typeof shot.velocity, spin: typeof shot.spin) =>
    shotKineticEnergy(shot, { ...(event ?? f.samples[0]), v, spin });
  const incomingDirection = event?.relativeIncoming ?? event?.v;
  const outgoingDirection = event?.relativeOutgoing ?? event?.outgoing;
  const incidence = event
    ? (Math.atan2(
        Math.max(0, -dot(incomingDirection!, event.normal)),
        norm(
          sub(
            incomingDirection!,
            scale(event.normal, dot(incomingDirection!, event.normal)),
          ),
        ),
      ) *
        180) /
      Math.PI
    : 0;
  const outgoingAngle = event
    ? (Math.atan2(
        Math.max(0, dot(outgoingDirection!, event.normal)),
        norm(
          sub(
            outgoingDirection!,
            scale(event.normal, dot(outgoingDirection!, event.normal)),
          ),
        ),
      ) *
        180) /
      Math.PI
    : 0;
  const segments = trajectorySegments(f.samples, events),
    yaw = shot.config.robot.heading + shot.config.robot.turretYaw;
  const project = (p: typeof shot.origin) => [
    (p[0] - shot.origin[0]) * Math.cos(yaw) +
      (p[1] - shot.origin[1]) * Math.sin(yaw),
    p[2],
  ];
  const residentTracks = s.showResidentPaths
    ? (f.ballTracks ?? []).slice(1)
    : [];
  const projected = [
      ...f.samples,
      ...residentTracks.flatMap((track) => track.samples),
    ].map((v) => project(v.p)),
    minX = Math.min(0, ...projected.map((p) => p[0])),
    maxX = Math.max(0.1, ...projected.map((p) => p[0])),
    maxZ = Math.max(0.1, ...projected.map((p) => p[1]));
  const chartPoint = (p: typeof shot.origin) => {
    const q = project(p);
    return [
      35 + ((q[0] - minX) / (maxX - minX)) * 530,
      143 - (q[1] / maxZ) * 110,
    ];
  };
  const end = f.samples.at(-1)!.t;
  const cannotPlay = !shot.shooter.exited || s.bounceBusy || !!f.bounceError;
  const play = () =>
    !cannotPlay &&
    s.set(
      !s.playing && s.playbackTime >= end - 0.01
        ? { playing: true, playReset: s.playReset + 1 }
        : { playing: !s.playing },
    );
  const cursor = chartPoint(
    f.samples.reduce((a, b) =>
      Math.abs(b.t - s.playbackTime) < Math.abs(a.t - s.playbackTime) ? b : a,
    ).p,
  );
  return (
    <div className="bounce-panel">
      <div className="bounce-heading">
        <strong>Sekiş laboratuvarı</strong>
        <span>
          {s.bounceBusy ? (
            s.bounceProgress || "Hesaplanıyor…"
          ) : f.bounceError ? (
            "Ayarı değiştirip yeniden hesapla"
          ) : (
            <>
              {events.length} çarpışma · {end.toFixed(2)} s ·{" "}
              {f.bounceEnd === "Stopped" ? "Toplar durdu" : "Süre sınırı"}
            </>
          )}
        </span>
      </div>
      <DynamicWorldControls shot={shot} />
      <ContactPhysics shot={shot} />
      <div className="resident-scenario">
        <div>
          <label>CELL içinde başlangıçtaki top sayısı</label>
          <div
            className="count-buttons"
            role="group"
            aria-label="CELL içindeki top sayısı"
          >
            {Array.from({ length: 9 }, (_, i) => (
              <button
                key={i}
                aria-label={`CELL içinde ${i} top`}
                aria-pressed={s.residentCount === i}
                onClick={() =>
                  changeScenario({
                    residentCount: i,
                    ...(i === 8 && s.residentLayout !== "manual"
                      ? { residentLayout: "center" as const }
                      : {}),
                    ...(s.residentLayout === "manual"
                      ? {
                          manualResidents: residentPositions(
                            s.config,
                            i,
                            "center",
                          ).map((p) => targetLocal(p, s.config.field.target)),
                        }
                      : {}),
                  })
                }
              >
                {i}
              </button>
            ))}
          </div>
        </div>
        <label>
          Başlangıç dizilimi
          <select
            aria-label="İçerideki topların dizilimi"
            value={s.residentLayout}
            onChange={(e) =>
              changeScenario({
                residentLayout: e.target.value as typeof s.residentLayout,
                ...(e.target.value === "manual"
                  ? {
                      manualResidents: residentPositions(
                        s.config,
                        s.residentCount,
                        "center",
                      ).map((p) => targetLocal(p, s.config.field.target)),
                    }
                  : {}),
              })
            }
          >
            <option value="center">
              {s.residentCount === 8
                ? "İki sıra örneği · 8 top"
                : "Tek sıra örneği – orta"}
            </option>
            <option value="left" disabled={s.residentCount === 8}>
              Tek sıra örneği – sol
            </option>
            <option value="right" disabled={s.residentCount === 8}>
              Tek sıra örneği – sağ
            </option>
            <option value="manual">Elle yerleştir</option>
          </select>
        </label>
        <button
          onClick={() =>
            s.set({ view: "CELL", cameraReset: s.cameraReset + 1 })
          }
        >
          CELL yakın plan ↗
        </button>
      </div>
      {s.residentLayout === "manual" && <ResidentPlacement />}
      <div className="bounce-outcomes">
        <span>
          {s.bounceBusy
            ? "Hesaplanıyor… "
            : shot.flight.bounceError
              ? "Sonuç üretilemedi · "
              : "Atılan top: "}
          <strong>
            {s.bounceBusy || f.bounceError
              ? "—"
              : f.retainedShot
                ? "CELL içinde"
                : "CELL dışında"}
          </strong>
        </span>
        <span>
          Başlangıçtaki toplardan içeride kalan:{" "}
          <strong>
            {s.bounceBusy || f.bounceError
              ? "—"
              : `${f.retainedResidents ?? 0} / ${f.residentCount ?? 0}`}
          </strong>
        </span>
        <span className="muted">Simülasyon sonundaki konum</span>
      </div>
      <div className="bounce-playback">
        <button disabled={cannotPlay} onClick={play}>
          {s.playing ? "Duraklat" : "Oynat"}
        </button>
        <label>
          Zaman{" "}
          <output>
            {s.playbackTime.toFixed(2)} / {end.toFixed(2)} s
          </output>
          <input
            aria-label="Sekiş zaman çizgisi"
            type="range"
            min="0"
            max={end}
            step="0.005"
            value={Math.min(end, s.playbackTime)}
            onChange={(e) => seek(Number(e.target.value))}
          />
        </label>
        <select
          aria-label="Sekiş oynatma hızı"
          value={s.playSpeed}
          onChange={(e) => s.set({ playSpeed: Number(e.target.value) })}
        >
          {[0.1, 0.25, 0.5, 1, 2].map((v) => (
            <option key={v} value={v}>
              {v}×
            </option>
          ))}
        </select>
      </div>
      <div className="bounce-path-legend">
        <span style={{ color: bouncePalette[0] }}>● İlk uçuş</span>
        <span style={{ color: bouncePalette[1] }}>● Sekiş trajectorysi</span>
        <label>
          <input
            type="checkbox"
            checked={s.showResidentPaths}
            onChange={(e) => s.set({ showResidentPaths: e.target.checked })}
          />
          İçerideki topların yolları
        </label>
      </div>
      <svg
        className="bounce-chart"
        viewBox="0 0 600 170"
        role="img"
        aria-label="Sekiş trajectorysi"
      >
        <line x1="35" x2="565" y1="143" y2="143" stroke="#8aabab66" />
        <text x="35" y="17">
          Atış yönünde yatay konum / yükseklik (m)
        </text>
        <text x="35" y="161">
          {minX.toFixed(2)} m
        </text>
        <text x="523" y="161">
          {maxX.toFixed(2)} m
        </text>
        <text x="4" y="38">
          {maxZ.toFixed(1)}
        </text>
        {segments.map((segment) => (
          <polyline
            key={segment.index}
            points={segment.samples
              .map((s) => chartPoint(s.p).join(","))
              .join(" ")}
            stroke={segment.color}
            strokeWidth="2.8"
            fill="none"
          />
        ))}
        {residentTracks.map((track) => {
          const [x, y] = chartPoint(sampleAt(track.samples, s.playbackTime).p);
          return (
            <g key={`resident-${track.id}`}>
              <polyline
                points={track.samples
                  .filter(
                    (_, i) => i % 3 === 0 || i === track.samples.length - 1,
                  )
                  .map((sample) => chartPoint(sample.p).join(","))
                  .join(" ")}
                stroke={track.color}
                strokeWidth="1.3"
                strokeDasharray="4 3"
                fill="none"
                opacity="0.7"
              />
              <circle cx={x} cy={y} r="3.5" fill={track.color}>
                <title>
                  Top {track.id} · {s.playbackTime.toFixed(2)} s
                </title>
              </circle>
            </g>
          );
        })}
        {events.map((e, i) => {
          const [x, y] = chartPoint(e.p);
          return (
            <g key={i} onClick={() => seek(e.t, i)} className="chart-impact">
              <circle
                cx={x}
                cy={y}
                r={selected === i ? 6 : 4}
                fill={bouncePalette[(i + 1) % bouncePalette.length]}
                stroke="#142128"
              />
              <title>
                {i + 1}. çarpışma · {surfaceNames[e.surface] ?? e.surface} ·{" "}
                {e.t.toFixed(2)} s
              </title>
            </g>
          );
        })}
        <circle cx={cursor[0]} cy={cursor[1]} r="4" fill="#ffffff" />
      </svg>
      {event && (
        <div className="impact-inspector">
          <div className="impact-picker">
            <label>
              Çarpışma
              <select
                aria-label="İncelenecek çarpışma"
                value={selected}
                onChange={(e) =>
                  seek(events[Number(e.target.value)].t, Number(e.target.value))
                }
              >
                {events.map((e, i) => (
                  <option key={i} value={i}>
                    #{i + 1} ·{" "}
                    {e.surface === "Ball"
                      ? `İçerideki top ${e.otherBallId}`
                      : (surfaceNames[e.surface] ?? e.surface)}{" "}
                    · {e.t.toFixed(2)} s
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => seek(Math.max(0, event.t - 0.06))}>
              Çarpmadan önce
            </button>
            <button onClick={() => seek(event.t + 0.04)}>
              Çarpmadan sonra
            </button>
          </div>
          <div className="impact-metrics">
            <span>
              Geliş → çıkış hızı
              <strong>
                {norm(event.v).toFixed(2)} → {norm(event.outgoing).toFixed(2)}{" "}
                m/s
              </strong>
            </span>
            <span>
              {event.surface === "Ball" ? "Top–top bağıl açı" : "Yüzeyle açı"}
              <strong>
                {incidence.toFixed(1)}° → {outgoingAngle.toFixed(1)}°
              </strong>
            </span>
            <span>
              Spin
              <strong>
                {((norm(event.spin) * 30) / Math.PI).toFixed(0)} →{" "}
                {(
                  (norm(event.outgoingSpin ?? event.spin) * 30) /
                  Math.PI
                ).toFixed(0)}{" "}
                RPM
              </strong>
            </span>
            <span>
              Topun enerji değişimi
              <strong>
                {(
                  (energy(event.outgoing, event.outgoingSpin ?? event.spin) -
                    energy(event.v, event.spin)) *
                  1000
                ).toFixed(1)}{" "}
                mJ
              </strong>
            </span>
          </div>
          <div className="impact-metrics">
            <span>
              Temas süresi
              <strong>{((event.duration ?? 0) * 1000).toFixed(2)} ms</strong>
            </span>
            <span>
              {s.bounceSettings.contactModel === "hertz"
                ? "Tepe temas kuvveti"
                : "Adım ortalama kuvveti"}
              <strong>{(event.peakForce ?? 0).toFixed(1)} N</strong>
            </span>
            <span>
              {s.bounceSettings.contactModel === "hertz"
                ? "En büyük sıkışma"
                : "Sayısal geçiş"}
              <strong>
                {((event.maxCompression ?? 0) * 1000).toFixed(2)} mm
              </strong>
            </span>
            <span>
              Temas davranışı
              <strong>
                {event.regime === "sliding" ? "Kayma" : "Tutunma"}
              </strong>
            </span>
            {event.hiveAngle !== undefined && (
              <span>
                HIVE açısı · çarpışma anı
                <strong>
                  {((event.hiveAngle * 180) / Math.PI - 30).toFixed(1)}°
                </strong>
              </span>
            )}
            {event.surfaceVelocity && (
              <span>
                Temas yüzeyinin hızı
                <strong>{norm(event.surfaceVelocity).toFixed(3)} m/s</strong>
              </span>
            )}
          </div>
          <p>
            Mavi ok: gelen hız · turkuaz ok: çıkan hız · pembe ok: yüzey
            normali. Açı yüzey düzlemine göre: 0° yatay sürtme, 90° dik çarpma.
          </p>
        </div>
      )}
      <details>
        <summary>Tüm topların çarpışma tablosu</summary>
        <div className="bounce-table">
          <table>
            <thead>
              <tr>
                <th>Top</th>
                <th>Yüzey / top</th>
                <th>Zaman</th>
                <th>Gelen → çıkan hız</th>
              </tr>
            </thead>
            <tbody>
              {(f.worldEvents ?? events).map((e, i) => (
                <tr key={i}>
                  <td>{e.ballId === 0 ? "Atılan" : `İçerideki ${e.ballId}`}</td>
                  <td>
                    {e.surface === "Ball"
                      ? `Top ${e.otherBallId === 0 ? "atılan" : e.otherBallId}`
                      : (surfaceNames[e.surface] ?? e.surface)}
                  </td>
                  <td>{e.t.toFixed(2)} s</td>
                  <td>
                    {norm(e.v).toFixed(2)} → {norm(e.outgoing).toFixed(2)} m/s
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="bounce-note">
        Sıralı dizilimler yerleşim örnekleridir; gerçek birikme dizilimi olarak
        kabul edilmez. Elle yerleştirilen toplar atıştan önce yerçekimiyle
        oturtulur; çarpışınca hepsi hareket eder. Seçilen dizilim ve temas
        modeline göre topların ve hareketli HIVE'ın hareketi birlikte
        hesaplanır. Gerçek şekil deformasyonu modellenmez. HIT sabit başlangıç
        CELL'inin giriş geometrisidir; içeride kalmayı alttaki sonuç gösterir.
        Auto solve topların etkisini hesaba katmaz.
      </p>
    </div>
  );
}
