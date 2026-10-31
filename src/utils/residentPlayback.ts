import { inCell } from "../physics/collisionWorld";
import { sampleAt } from "../physics/flight";
import { createHive, hiveTarget, sampleHive } from "../physics/hiveDynamics";
import { norm } from "../physics/math";
import type { Shot } from "../physics/types";

/** Evaluate each free body against the CELL pose at this playback instant. */
export function residentPlayback(shot: Shot, time: number) {
  const c = shot.config,
    hive = createHive(
      c,
      shot.flight.diagnostics?.settings ?? {
        floor: 0,
        wall: 0,
        cell: 0,
        friction: 0,
        rollingResistance: 0,
      },
    ),
    pose = sampleHive(shot.flight.hiveTrack ?? [], time);
  hive.angle = pose?.angle ?? hive.angle;
  const active = { ...c, field: { ...c.field, target: hiveTarget(c, hive) } },
    opposite = {
      ...c,
      field: { ...c.field, target: hiveTarget(c, hive, true) },
    },
    floorHits = new Set(
      (shot.flight.worldEvents ?? [])
        .filter((e) => e.surface === "Floor" && e.t <= time)
        .map((e) => e.ballId),
    );
  return (shot.flight.ballTracks ?? [])
    .filter((track) => track.id > 0)
    .map((track) => {
      const state = sampleAt(track.samples, time),
        inside = inCell(state.p, active) || inCell(state.p, opposite),
        onFloor = state.p[2] <= (c.projectile.diameter / 2) * 1.12 + 0.003;
      return {
        id: track.id,
        color: track.color,
        state,
        inside,
        reachedFloor: floorHits.has(track.id),
        speed: norm(state.v),
        status: inside
          ? "CELL içinde"
          : onFloor
            ? "Zeminde"
            : state.v[2] < -0.08
              ? "Düşüyor"
              : state.v[2] > 0.08
                ? "Yükseliyor"
                : "Serbest",
      };
    });
}
