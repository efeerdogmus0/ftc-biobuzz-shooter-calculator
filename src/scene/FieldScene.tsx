import { Suspense, useEffect, useRef, useMemo } from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import {
  OrbitControls,
  Line,
  Html,
  useGLTF,
  GizmoHelper,
  GizmoViewcube,
} from "@react-three/drei";
import {
  Vector3,
  Plane,
  Color,
  ArrowHelper,
  Matrix4,
  Quaternion,
  type Group,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useStore } from "../state/store";
import { defaultScenario } from "../utils/scenario";
import type { Shot, Vec3 } from "../physics/types";
import { shooterPose, sampleAt, aim } from "../physics/flight";
import { HiveModel } from "./HiveModel";
import { PollenBall } from "./PollenBall";
import { createHive, hiveTarget } from "../physics/hiveDynamics";
import { Flowers } from "./FlowerModel";
import { flowerPlacements, flowerDimensions } from "../field/flowerGeometry";
import { hiveCells, hiveCellTarget } from "../field/hiveGeometry";
import { trajectorySegments, bouncePalette } from "../utils/bounceView";
import { cellSurfaceGeometry } from "../physics/collisionWorld";
import {
  targetBasis,
  targetWorld,
  targetOpeningPoints,
} from "../physics/flight";
import { scale, add, norm, unit, sub } from "../physics/math";
import { sampleAerodynamics } from "../physics/aerodynamics";
const floorPlane = new Plane(new Vector3(0, 0, 1), 0);
function Camera({ shot }: { shot: Shot }) {
  const latestShot = useRef(shot);
  useEffect(() => {
    latestShot.current = shot;
  }, [shot]);
  const view = useStore((s) => s.view),
    reset = useStore((s) => s.cameraReset),
    dragging = useStore((s) => s.dragging);
  const { camera, size } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const followConfig = useStore((s) =>
    s.view === "Shooter" ||
    s.view === "Target" ||
    s.view === "CELL" ||
    s.view === "HIVE"
      ? s.config
      : null,
  );
  useEffect(() => {
    const c = useStore.getState().config,
      { origin, yaw } = shooterPose(c);
    const target = new Vector3(0, 0, 0.4);
    let pos: Vec3 = [3.3, -4.2, 3.1];
    if (view === "Top") pos = [0, -0.001, 6];
    if (view === "Side") pos = [0, -6, 1.7];
    if (view === "Shooter") {
      pos = [
        origin[0] - 0.45 * Math.cos(yaw),
        origin[1] - 0.45 * Math.sin(yaw),
        origin[2] + 0.2,
      ];
      target.set(...c.field.target.center);
    }
    if (view === "Target") {
      pos = [
        c.field.target.center[0] + 0.1,
        c.field.target.center[1] + 1,
        c.field.target.center[2] + 0.8,
      ];
      target.set(...origin);
    }
    if (view === "CELL") {
      const { u, v, n } = targetBasis(c.field.target);
      target.set(
        ...targetWorld([0, -0.025, -c.field.target.depth / 2], c.field.target),
      );
      pos = add(
        c.field.target.center,
        add(scale(n, 0.85), add(scale(u, 0.22), scale(v, 0.08))),
      );
      if (
        useStore.getState().bounceEnabled &&
        useStore.getState().bounceSettings.hiveMotion
      ) {
        const pivot: Vec3 = [
          c.field.target.center[0],
          0,
          c.field.hive.pivotHeight + 0.12,
        ];
        target.set(...pivot);
        pos = add(pivot, add(scale(n, 1.45), add(scale(u, 0.4), [0, 0, 0.3])));
      }
    }
    // Fit the field in both dimensions, including narrow embedded viewports.
    if (view === "HIVE") {
      target.set(
        c.field.target.center[0],
        0,
        c.field.hive.topOpeningHeight / 2,
      );
      const { u, n } = targetBasis(c.field.target);
      pos = add(
        target.toArray() as Vec3,
        add(scale(u, 0.55), [n[0], n[1], 0.38]),
      );
    }
    if (
      view === "Orbit" ||
      view === "Top" ||
      view === "Side" ||
      view === "HIVE"
    ) {
      const direction = new Vector3(...pos).sub(target).normalize();
      const right = new Vector3()
        .crossVectors(direction, new Vector3(0, 0, 1))
        .normalize();
      const up = new Vector3().crossVectors(right, direction).normalize();
      const tanVertical = Math.tan((43 * Math.PI) / 360);
      const tanHorizontal =
        (tanVertical * size.width) / Math.max(1, size.height);
      const half =
        view === "HIVE" ? 1.05 : c.field.size / 2 + c.field.wallThickness;
      const centerX = view === "HIVE" ? c.field.target.center[0] : 0,
        halfX = view === "HIVE" ? 0.55 : half;
      const bounds: Vec3[] = [];
      for (const x of [centerX - halfX, centerX + halfX])
        for (const y of [-half, half])
          for (const z of [
            0,
            view === "HIVE"
              ? c.field.hive.topOpeningHeight + 0.15
              : c.field.wallHeight,
          ])
            bounds.push([x, y, z]);
      if (view !== "HIVE") {
        for (const cell of hiveCells(c.field)) {
          const t = hiveCellTarget(cell, c.field);
          for (const point of targetOpeningPoints(t))
            for (const depth of [0, -t.depth])
              bounds.push(targetWorld([point[0], point[1], depth], t));
        }
        for (const post of flowerPlacements(c.field.size))
          bounds.push(
            add(post.position, [
              0,
              0,
              flowerDimensions.openingHeight + flowerDimensions.backstopHeight,
            ]),
          );
        if (useStore.getState().showTrajectory)
          bounds.push(
            ...latestShot.current.flight.samples.map((sample) => sample.p),
          );
      }
      const horizontal = tanHorizontal * 0.91,
        vertical = tanVertical * 0.88;
      let rightExtent = -Infinity,
        leftExtent = -Infinity,
        topExtent = -Infinity,
        bottomExtent = -Infinity;
      for (const point of bounds) {
        const offset = new Vector3(...point).sub(target);
        const depth = offset.dot(direction),
          x = offset.dot(right),
          y = offset.dot(up);
        rightExtent = Math.max(rightExtent, depth + x / horizontal);
        leftExtent = Math.max(leftExtent, depth - x / horizontal);
        topExtent = Math.max(topExtent, depth + y / vertical);
        bottomExtent = Math.max(bottomExtent, depth - y / vertical);
      }
      // Center the projected bounds, allowing the field to fill short docked views.
      const distance = Math.max(
        (rightExtent + leftExtent) / 2,
        (topExtent + bottomExtent) / 2,
        0.5,
      );
      target
        .addScaledVector(right, (horizontal * (rightExtent - leftExtent)) / 2)
        .addScaledVector(up, (vertical * (topExtent - bottomExtent)) / 2);
      pos = target
        .clone()
        .addScaledVector(direction, distance)
        .toArray() as Vec3;
    }
    camera.up.set(0, 0, 1);
    camera.position.set(...pos);
    camera.lookAt(target);
    if (controls.current) {
      // Flush any pending orbit inertia before applying a camera preset.
      controls.current.enableDamping = false;
      controls.current.update();
      camera.position.set(...pos);
      controls.current.target.copy(target);
      controls.current.update();
      controls.current.enableDamping = true;
    }
  }, [view, reset, camera, followConfig, size.width, size.height]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={!dragging}
      minDistance={0.15}
      maxDistance={12}
      maxPolarAngle={Math.PI * 0.49}
    />
  );
}
function Robot() {
  const c = useStore((s) => s.config),
    dragging = useStore((s) => s.dragging),
    set = useStore((s) => s.set);
  const group = useRef<Group>(null);
  const yaw = c.robot.heading + c.robot.turretYaw,
    { origin } = shooterPose(c);
  const move = (e: ThreeEvent<PointerEvent>) => {
    if (!useStore.getState().dragging) return;
    e.stopPropagation();
    const point = new Vector3();
    if (e.ray.intersectPlane(floorPlane, point)) {
      const s = useStore.getState(),
        q = structuredClone(s.config),
        margin = Math.hypot(q.robot.width, q.robot.length) / 2,
        limit = q.field.size / 2 - margin;
      const snap = (v: number) =>
        s.snap ? Math.round(v / s.snap) * s.snap : v;
      q.robot.x = Math.max(-limit, Math.min(limit, snap(point.x)));
      q.robot.y = Math.max(-limit, Math.min(limit, snap(point.y)));
      s.setConfig(s.autoAim ? aim(q) : q);
    }
  };
  return (
    <>
      <group
        ref={group}
        position={[c.robot.x, c.robot.y, 0]}
        rotation={[0, 0, c.robot.heading]}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (e.button !== 0) return;
          set({ dragging: true });
          (e.target as unknown as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={move}
        onPointerUp={(e) => {
          e.stopPropagation();
          set({ dragging: false });
          (e.target as unknown as HTMLElement).releasePointerCapture(
            e.pointerId,
          );
        }}
        onPointerOver={() => {
          document.body.style.cursor = "grab";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
      >
        <mesh position={[0, 0, 0.095]}>
          <boxGeometry args={[c.robot.length, c.robot.width, 0.15]} />
          <meshStandardMaterial
            color={dragging ? "#f4d585" : "#b2babb"}
            metalness={0.65}
            roughness={0.35}
          />
        </mesh>
        <mesh position={[0, 0, 0.177]}>
          <boxGeometry
            args={[c.robot.length * 0.82, c.robot.width * 0.82, 0.014]}
          />
          <meshStandardMaterial color="#25323a" />
        </mesh>
        {[-1, 1].flatMap((x) =>
          [-1, 1].map((y) => (
            <mesh
              key={`${x}${y}`}
              position={[
                x * c.robot.length * 0.35,
                y * (c.robot.width / 2 + 0.012),
                0.072,
              ]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.067, 0.067, 0.042, 20]} />
              <meshStandardMaterial color="#11191e" />
            </mesh>
          )),
        )}
        <Line
          points={[
            [0, 0, 0.19],
            [0.29, 0, 0.19],
            [0.23, 0.04, 0.19],
            [0.29, 0, 0.19],
            [0.23, -0.04, 0.19],
          ]}
          color="#96c8fa"
          lineWidth={2}
        />
        <group
          position={c.robot.turretCenter}
          rotation={[0, 0, c.robot.turretYaw]}
        >
          <mesh position={[0, 0, 0.22]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.125, 0.125, 0.055, 32]} />
            <meshStandardMaterial
              color="#47565d"
              metalness={0.6}
              roughness={0.3}
            />
          </mesh>
          <mesh
            position={[
              c.robot.exitOffset[0] - 0.025,
              c.robot.exitOffset[1],
              c.robot.exitOffset[2] - 0.015,
            ]}
          >
            <cylinderGeometry
              args={[
                c.shooter.primary.diameter / 2,
                c.shooter.primary.diameter / 2,
                0.055,
                32,
              ]}
            />
            <meshStandardMaterial color="#edbe66" />
          </mesh>
          <mesh
            position={[
              c.robot.exitOffset[0] + 0.03,
              c.robot.exitOffset[1],
              c.robot.exitOffset[2] + 0.065,
            ]}
          >
            <cylinderGeometry
              args={[
                c.shooter.secondary.diameter / 2,
                c.shooter.secondary.diameter / 2,
                0.05,
                20,
              ]}
            />
            <meshStandardMaterial color="#a4cfbe" />
          </mesh>
        </group>
      </group>
      {useStore.getState().overlays.origin && (
        <mesh position={origin}>
          <sphereGeometry args={[0.014, 16, 12]} />
          <meshBasicMaterial color="#ffefb0" />
        </mesh>
      )}
      {useStore.getState().overlays.tangent && (
        <group position={origin} rotation={[0, 0, yaw]}>
          {[c.shooter.hoodMin, c.shooter.hoodAngle, c.shooter.hoodMax].map(
            (a, i) => (
              <Line
                key={i}
                points={[
                  [0, 0, 0],
                  [
                    0.38 * Math.cos(a + c.shooter.hoodOffset),
                    0,
                    0.38 * Math.sin(a + c.shooter.hoodOffset),
                  ],
                ]}
                color={i === 1 ? "#f6cd77" : "#647577"}
                lineWidth={i === 1 ? 2 : 1}
              />
            ),
          )}
          <Line
            points={Array.from({ length: 33 }, (_, i) => {
              const a =
                c.shooter.hoodMin +
                ((c.shooter.hoodMax - c.shooter.hoodMin) * i) / 32;
              return [0.27 * Math.cos(a), 0, 0.27 * Math.sin(a)] as Vec3;
            })}
            color="#8b7852"
          />
        </group>
      )}
    </>
  );
}
function Trajectory({
  shot,
  history = false,
  onClick,
}: {
  shot: Shot;
  history?: boolean;
  onClick?: () => void;
}) {
  const mode = useStore((s) => s.trajectoryColor);
  const light = useStore((s) => s.theme === "light");
  const points = shot.flight.samples.map((s) => s.p);
  if (!history && shot.flight.bounces?.length) {
    return (
      <>
        {trajectorySegments(shot.flight.samples, shot.flight.bounces).map(
          (segment) => (
            <Line
              key={segment.index}
              points={segment.samples.map((s) => s.p)}
              color={segment.color}
              lineWidth={segment.index ? 4.5 : 2.8}
              depthTest={false}
              renderOrder={20}
              transparent
              opacity={segment.index ? 1 : 0.8}
            />
          ),
        )}
      </>
    );
  }
  const colors =
    history || (mode === "status" && !shot.flight.bounces?.length)
      ? undefined
      : shot.flight.samples.map((s) => {
          if (mode === "status")
            return new Color(
              s.t > (shot.flight.impact?.t ?? Infinity)
                ? "#66ded1"
                : shot.flight.status === "HIT"
                  ? "#bce3a9"
                  : "#e9c27c",
            );
          const t =
            mode === "time"
              ? s.t / (shot.flight.samples.at(-1)!.t || 1)
              : mode === "speed"
                ? norm(s.v) / Math.max(shot.shooter.speed, 1)
                : 0.5 + s.v[2] / Math.max(shot.shooter.speed, 1) / 2;
          return new Color().setHSL(
            0.58 * (1 - Math.min(1, Math.max(0, t))),
            0.6,
            0.65,
          );
        });
  return points.length > 1 ? (
    <Line
      points={points}
      vertexColors={colors}
      color={
        colors
          ? "#ffffff"
          : history
            ? "#637581"
            : light
              ? "#e89512"
              : shot.flight.status === "HIT"
                ? "#bce3a9"
                : "#e9c27c"
      }
      lineWidth={history ? 1.5 : 2.8}
      transparent
      opacity={history ? 0.42 : 1}
      onClick={onClick}
    />
  ) : null;
}
function Ghost({ shot }: { shot: Shot }) {
  const refs = useRef<(Group | null)[]>([]),
    time = useRef(0),
    published = useRef(0);
  const settings = useStore((s) => s.bounceSettings);
  const reset = useStore((s) => s.playReset),
    seekTick = useStore((s) => s.seekTick);
  const tracks = shot.flight.ballTracks ?? [
    { id: 0, color: "#f5ce77", samples: shot.flight.samples },
  ];
  useEffect(() => {
    time.current = 0;
    published.current = 0;
    useStore.getState().set({ playbackTime: 0 });
  }, [reset, shot]);
  useEffect(() => {
    time.current = useStore.getState().seekTime;
    published.current = -1;
  }, [seekTick]);
  useFrame((_s, dt) => {
    const s = useStore.getState(),
      end = shot.flight.samples.at(-1)!.t;
    if (s.playing) time.current += dt * s.playSpeed;
    if (time.current > end) {
      time.current = end;
      s.set({ playing: false });
    }
    if (
      Math.abs(time.current - published.current) > 0.04 ||
      (!s.playing && time.current !== published.current)
    ) {
      published.current = time.current;
      s.set({ playbackTime: time.current });
    }
    for (const track of tracks) {
      const state = sampleAt(track.samples, time.current),
        group = refs.current[track.id];
      group?.position.set(...state.p);
      const sphere = group?.children[0];
      if (sphere && state.rotation) sphere.quaternion.set(...state.rotation);
    }
  });
  return (
    <>
      {tracks.map((track) => (
        <group
          key={track.id}
          ref={(g) => {
            refs.current[track.id] = g;
          }}
          position={track.samples[0].p}
        >
          <group>
            {settings.shapeModel === "pollen" ? (
              <PollenBall
                radius={shot.config.projectile.diameter / 2}
                color={track.color}
                settings={settings}
              />
            ) : (
              <mesh>
                <sphereGeometry
                  args={[shot.config.projectile.diameter / 2, 24, 16]}
                />
                <meshStandardMaterial
                  color={track.color}
                  roughness={0.6}
                  emissive={track.color}
                  emissiveIntensity={0.13}
                />
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry
                    args={[
                      (shot.config.projectile.diameter / 2) * 1.003,
                      shot.config.projectile.diameter * 0.015,
                      6,
                      40,
                    ]}
                  />
                  <meshBasicMaterial color="#223438" />
                </mesh>
                <mesh rotation={[0, 0, Math.PI / 2]}>
                  <torusGeometry
                    args={[
                      (shot.config.projectile.diameter / 2) * 1.005,
                      shot.config.projectile.diameter * 0.012,
                      6,
                      40,
                    ]}
                  />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
              </mesh>
            )}
          </group>
          {track.id > 0 && (
            <Html
              position={[0, 0, shot.config.projectile.diameter / 2 + 0.015]}
              center
              className="resident-label"
            >
              {track.id}
            </Html>
          )}
        </group>
      ))}
    </>
  );
}
function DirectionArrow({
  p,
  v,
  color,
  length = 0.18,
}: {
  p: Vec3;
  v: Vec3;
  color: string;
  length?: number;
}) {
  const arrow = useMemo(
    () =>
      new ArrowHelper(
        new Vector3(...unit(v)),
        new Vector3(...p),
        length,
        color,
        0.045,
        0.025,
      ),
    [p, v, color, length],
  );
  return norm(v) > 0.001 ? <primitive object={arrow} /> : null;
}
function CollisionDetails({ shot }: { shot: Shot }) {
  const selected = useStore((s) => s.selectedBounce),
    showPaths = useStore((s) => s.showResidentPaths),
    view = useStore((s) => s.view);
  const events = shot.flight.bounces ?? [],
    event = events[Math.min(selected, events.length - 1)];
  const hive = createHive(shot.config, {
    floor: 0,
    wall: 0,
    cell: 0,
    friction: 0,
    rollingResistance: 0,
    hiveMotion: false,
  });
  hive.angle = event?.hiveAngle ?? 0;
  const target = hiveTarget(
    shot.config,
    hive,
    event?.surface.startsWith("Opposite "),
  );
  const surfaces = cellSurfaceGeometry(shot.config),
    basis = targetBasis(target);
  const quaternion = new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(
      new Vector3(...basis.u),
      new Vector3(...basis.v),
      new Vector3(...basis.n),
    ),
  );
  const selectedSurface = event
    ? surfaces.find((s) => s.name === event.surface.replace(/^Opposite /, ""))
    : undefined;
  return (
    <>
      {showPaths &&
        shot.flight.ballTracks
          ?.slice(1)
          .map((track) => (
            <Line
              key={track.id}
              points={track.samples.map((s) => s.p)}
              color={track.color}
              lineWidth={view === "HIVE" ? 2 : 1.4}
              transparent
              opacity={view === "HIVE" ? 0.75 : 0.5}
              dashed
              dashSize={0.018}
              gapSize={0.012}
              depthTest={false}
              renderOrder={19}
            />
          ))}
      {event && view !== "HIVE" && (
        <group>
          <mesh position={event.p}>
            <sphereGeometry args={[0.025, 16, 10]} />
            <meshBasicMaterial
              color="#ffffff"
              transparent
              opacity={0.8}
              depthTest={false}
            />
          </mesh>
          <DirectionArrow
            p={sub(event.p, scale(unit(event.v), 0.22))}
            v={event.v}
            color="#75baff"
            length={0.22}
          />
          <DirectionArrow
            p={event.p}
            v={event.outgoing}
            color="#66e6d4"
            length={0.22}
          />
          <DirectionArrow
            p={event.contact ?? event.p}
            v={event.normal}
            color="#ff9fca"
            length={0.15}
          />
          <Html
            position={add(event.p, [0, 0, 0.14])}
            center
            className="impact-label"
          >
            #{Math.min(selected, events.length - 1) + 1} · {event.t.toFixed(2)}{" "}
            s
          </Html>
        </group>
      )}
      {selectedSurface && view === "CELL" && (
        <group position={target.center} quaternion={quaternion}>
          <mesh
            position={[
              selectedSurface.center[0],
              selectedSurface.center[1],
              -selectedSurface.size[2] / 2,
            ]}
            rotation={[0, 0, selectedSurface.angle]}
          >
            <boxGeometry args={selectedSurface.size} />
            <meshBasicMaterial
              color="#ff9fca"
              transparent
              opacity={0.25}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}
      {view !== "HIVE" &&
        events.map((e, i) =>
          i === 0 || norm(sub(e.p, events[i - 1].p)) > 0.035 ? (
            <group key={i} position={e.p}>
              <mesh>
                <sphereGeometry args={[0.012, 12, 8]} />
                <meshBasicMaterial
                  color={bouncePalette[(i + 1) % bouncePalette.length]}
                  depthTest={false}
                />
              </mesh>
              <Html position={[0, 0, 0.045]} center className="scene-label">
                <button
                  className="impact-marker"
                  onClick={() => {
                    const s = useStore.getState();
                    s.set({
                      selectedBounce: i,
                      playing: false,
                      seekTime: e.t,
                      seekTick: s.seekTick + 1,
                    });
                  }}
                >
                  #{i + 1}
                </button>
              </Html>
            </group>
          ) : null,
        )}
    </>
  );
}
function Drive() {
  const keys = useRef(new Set<string>());
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches("input,textarea,select")) return;
      if (["w", "a", "s", "d", "q", "e"].includes(e.key.toLowerCase())) {
        keys.current.add(e.key.toLowerCase());
        if (useStore.getState().drive) e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const clear = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);
  useFrame((_s, dt) => {
    const s = useStore.getState();
    if (!s.drive || !keys.current.size) return;
    const c = structuredClone(s.config),
      k = keys.current,
      limit = c.field.size / 2 - Math.hypot(c.robot.width, c.robot.length) / 2;
    c.robot.x = Math.max(
      -limit,
      Math.min(
        limit,
        c.robot.x + ((k.has("d") ? 1 : 0) - (k.has("a") ? 1 : 0)) * dt * 0.7,
      ),
    );
    c.robot.y = Math.max(
      -limit,
      Math.min(
        limit,
        c.robot.y + ((k.has("w") ? 1 : 0) - (k.has("s") ? 1 : 0)) * dt * 0.7,
      ),
    );
    c.robot.heading += ((k.has("q") ? 1 : 0) - (k.has("e") ? 1 : 0)) * dt;
    s.setConfig(s.autoAim ? aim(c) : c);
  });
  return null;
}
function CAD({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}
function World({ shot }: { shot: Shot }) {
  const s = useStore(),
    c = s.config,
    half = c.field.size / 2;
  const forces = sampleAerodynamics(
    shot.flight.samples[0],
    c,
    shot.flight.aeroAxes,
  );
  const palette = new Color();
  return (
    <>
      <color
        attach="background"
        args={[s.theme === "dark" ? "#242b35" : "#ffffff"]}
      />
      <ambientLight intensity={1.3} />
      <directionalLight position={[2, -3, 7]} intensity={2} />
      <Camera shot={shot} />
      <GizmoHelper alignment="top-right" margin={[55, 95]} renderPriority={1}>
        <GizmoViewcube
          color={s.theme === "light" ? "#cbd2dc" : "#485361"}
          textColor={s.theme === "light" ? "#354250" : "#e0e6ee"}
          strokeColor="#aab5c1"
          hoverColor="#c7e1fa"
          opacity={1}
          font="20px Arial"
          faces={["Right", "Left", "Back", "Front", "Top", "Bottom"]}
        />
      </GizmoHelper>
      <GizmoHelper alignment="bottom-left" margin={[44, 51]} renderPriority={2}>
        {(
          [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ] as Vec3[]
        ).map((axis, i) => (
          <group key={i}>
            <arrowHelper
              args={[
                new Vector3(...axis),
                new Vector3(),
                29,
                ["#d54843", "#3b9656", "#2486db"][i],
                6,
                3,
              ]}
            />
            <Html
              position={axis.map((x) => x * 37) as Vec3}
              center
              className={`axis-label axis-${i}`}
            >
              {"XYZ"[i]}
            </Html>
          </group>
        ))}
      </GizmoHelper>
      <Drive />
      <mesh position={[0, 0, -0.04]}>
        <boxGeometry args={[c.field.size + 0.1, c.field.size + 0.1, 0.08]} />
        <meshStandardMaterial
          color={s.theme === "light" ? "#929aa2" : "#343e42"}
          roughness={1}
        />
      </mesh>
      {Array.from({ length: 7 }, (_, i) => {
        const a = -half + (i * c.field.size) / 6;
        return (
          <group key={i}>
            <Line
              points={[
                [a, -half, 0.002],
                [a, half, 0.002],
              ]}
              color={s.theme === "light" ? "#c6cdd3" : "#515b5b"}
              lineWidth={1}
            />
            <Line
              points={[
                [-half, a, 0.002],
                [half, a, 0.002],
              ]}
              color={s.theme === "light" ? "#c6cdd3" : "#515b5b"}
              lineWidth={1}
            />
          </group>
        );
      })}
      {s.overlays.field &&
        [-1, 1].flatMap((sign) => [
          <mesh
            key={`x${sign}`}
            position={[
              sign * (half + c.field.wallThickness / 2),
              0,
              c.field.wallHeight / 2,
            ]}
          >
            <boxGeometry
              args={[c.field.wallThickness, c.field.size, c.field.wallHeight]}
            />
            <meshStandardMaterial color="#899498" transparent opacity={0.16} />
          </mesh>,
          <mesh
            key={`y${sign}`}
            position={[
              0,
              sign * (half + c.field.wallThickness / 2),
              c.field.wallHeight / 2,
            ]}
          >
            <boxGeometry
              args={[c.field.size, c.field.wallThickness, c.field.wallHeight]}
            />
            <meshStandardMaterial color="#899498" transparent opacity={0.16} />
          </mesh>,
        ])}
      <Line
        points={[
          [-half, -half, 0.012],
          [half, -half, 0.012],
          [half, half, 0.012],
          [-half, half, 0.012],
          [-half, -half, 0.012],
        ]}
        color="#91a5a9"
      />
      {c.field.obstacles
        .filter((b) => s.overlays.collisions || !b.name.startsWith("HIVE "))
        .map((b) => (
          <mesh
            key={b.name}
            position={b.min.map((x, i) => (x + b.max[i]) / 2) as Vec3}
          >
            <boxGeometry args={b.min.map((x, i) => b.max[i] - x) as Vec3} />
            <meshStandardMaterial
              color="#647887"
              transparent
              opacity={s.overlays.collisions ? 0.4 : 0.7}
              depthWrite={!s.overlays.collisions}
              wireframe={s.overlays.collisions}
            />
          </mesh>
        ))}
      <HiveModel shot={shot} />
      <Flowers />
      <Robot />
      {s.overlays.center && (
        <mesh position={[c.robot.x, c.robot.y, 0.1]}>
          <sphereGeometry args={[0.02, 12, 8]} />
          <meshBasicMaterial color="#a9d6dc" />
        </mesh>
      )}
      {s.overlays.velocity && (
        <Line
          points={[shot.origin, add(shot.origin, scale(shot.velocity, 0.1))]}
          color="#d2e4a0"
          lineWidth={3}
        />
      )}
      {s.overlays.markers && s.showTrajectory && shot.flight.impact && (
        <mesh position={shot.flight.impact.p}>
          <sphereGeometry args={[0.021, 12, 8]} />
          <meshBasicMaterial
            color={shot.flight.status === "HIT" ? "#aed6aa" : "#ed9380"}
          />
        </mesh>
      )}
      <Ghost shot={shot} />
      {s.showTrajectory && (
        <>
          <Trajectory shot={shot} />
          {s.bounceEnabled && <CollisionDetails shot={shot} />}
        </>
      )}
      {s.history.map((h) => (
        <Trajectory
          key={h.id}
          shot={h.shot}
          history
          onClick={() =>
            s.setScenario(h.scenario ?? defaultScenario(h.shot.config))
          }
        />
      ))}
      {s.overlays.markers && s.showTrajectory && (
        <>
          <mesh position={shot.flight.apex.p}>
            <sphereGeometry args={[0.018, 12, 8]} />
            <meshBasicMaterial color="#e89512" />
          </mesh>
          <Html
            position={add(shot.flight.apex.p, [0, 0, 0.1])}
            center
            className="scene-label apex-label"
          >
            {shot.flight.apex.p[2].toFixed(2)} m
          </Html>
          {Array.from(
            { length: Math.floor(shot.flight.samples.at(-1)!.t * 10) },
            (_, i) => (
              <mesh
                key={i}
                position={sampleAt(shot.flight.samples, (i + 1) / 10).p}
              >
                <sphereGeometry args={[0.009, 8, 6]} />
                <meshBasicMaterial color="#dbd7bc" />
              </mesh>
            ),
          )}
          {shot.flight.entry && (
            <mesh position={shot.flight.entry.p}>
              <sphereGeometry args={[0.024, 12, 8]} />
              <meshBasicMaterial color="#bce3a9" />
            </mesh>
          )}
        </>
      )}
      {s.overlays.aim && (
        <Line
          points={[
            [c.robot.x, c.robot.y, 0.012],
            [c.field.target.center[0], c.field.target.center[1], 0.012],
          ]}
          color="#678279"
          dashed
          dashSize={0.06}
          gapSize={0.04}
        />
      )}
      {s.overlays.axes && <axesHelper args={[1]} />}
      {s.overlays.measurements && (
        <Html position={[0, -half - 0.12, 0]} center className="scene-label">
          3.658 m <span>144 in</span>
        </Html>
      )}
      {s.overlays.forces &&
        [
          forces.drag,
          forces.lift,
          [0, 0, -c.projectile.mass * c.environment.gravity] as Vec3,
        ].map((v, i) => (
          <Line
            key={i}
            points={[shot.origin, add(shot.origin, scale(v, 0.5))]}
            color={["#d98376", "#a3cbe3", "#ba9dda"][i]}
            lineWidth={3}
          />
        ))}
      {s.overlays.spin && (
        <Line
          points={[shot.origin, add(shot.origin, scale(shot.spin, 0.003))]}
          color="#ba9dda"
          lineWidth={3}
        />
      )}
      {s.coverage.map((cell, i) => {
        const v = cell.candidate;
        let color = "#bd635e";
        if (v) {
          const t =
            s.coverageMode === "angle"
              ? v.angle / (Math.PI / 2)
              : s.coverageMode === "velocity"
                ? v.speed / c.simulation.maxSpeed
                : s.coverageMode === "energy"
                  ? v.energy / 2
                  : 1 - Math.min(1, v.clearance / 0.1);
          color = palette.setHSL(0.34 * (1 - t), 0.55, 0.5).getStyle();
        }
        return (
          <mesh key={i} position={[cell.x, cell.y, 0.008]}>
            <planeGeometry
              args={[s.heatSpacing * 0.93, s.heatSpacing * 0.93]}
            />
            <meshBasicMaterial color={color} transparent opacity={0.55} />
          </mesh>
        );
      })}
      {s.cadURL && (
        <Suspense fallback={null}>
          <CAD url={s.cadURL} />
        </Suspense>
      )}
    </>
  );
}
export function FieldScene({ shot }: { shot: Shot }) {
  return (
    <Canvas
      camera={{
        position: [4, -5, 4.4],
        up: [0, 0, 1],
        fov: 43,
        near: 0.01,
        far: 40,
      }}
      dpr={[1, 1.5]}
      gl={{ antialias: true }}
    >
      <World shot={shot} />
    </Canvas>
  );
}
