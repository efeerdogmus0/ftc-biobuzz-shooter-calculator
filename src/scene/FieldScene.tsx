import { Suspense, useEffect, useMemo, useRef } from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { OrbitControls, Line, Html, useGLTF } from "@react-three/drei";
import {
  Vector3,
  Plane,
  Quaternion,
  Matrix4,
  Color,
  type Mesh,
  type Group,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useStore } from "../state/store";
import type { Shot, Vec3 } from "../physics/types";
import {
  targetBasis,
  targetOpeningPoints,
  targetWorld,
  shooterPose,
  sampleAt,
  aim,
} from "../physics/flight";
import { hiveCellTarget, hiveCells } from "../field/hiveGeometry";
import { scale, add, norm } from "../physics/math";
import { aerodynamicForces } from "../physics/aerodynamics";
const floorPlane = new Plane(new Vector3(0, 0, 1), 0);
function Camera() {
  const view = useStore((s) => s.view),
    reset = useStore((s) => s.cameraReset),
    dragging = useStore((s) => s.dragging);
  const { camera, size } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const followConfig = useStore((s) =>
    s.view === "Shooter" || s.view === "Target" ? s.config : null,
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
    // Fit the field in both dimensions, including narrow embedded viewports.
    if (view === "Orbit" || view === "Top" || view === "Side") {
      const direction = new Vector3(...pos).sub(target).normalize();
      const right = new Vector3()
        .crossVectors(direction, new Vector3(0, 0, 1))
        .normalize();
      const up = new Vector3().crossVectors(right, direction).normalize();
      const tanVertical = Math.tan((43 * Math.PI) / 360);
      const tanHorizontal =
        (tanVertical * size.width) / Math.max(1, size.height);
      let distance = 0;
      const half = c.field.size / 2 + c.field.wallThickness;
      for (const x of [-half, half])
        for (const y of [-half, half])
          for (const z of [0, c.field.hive.topOpeningHeight]) {
            const offset = new Vector3(x, y, z).sub(target);
            distance = Math.max(
              distance,
              offset.dot(direction) +
                Math.max(
                  Math.abs(offset.dot(right)) / (tanHorizontal * 0.85),
                  Math.abs(offset.dot(up)) / (tanVertical * 0.8),
                ),
            );
          }
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
function targetQuaternion(
  t: ReturnType<typeof useStore.getState>["config"]["field"]["target"],
) {
  const { u, v, n } = targetBasis(t);
  return new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(
      new Vector3(...u),
      new Vector3(...v),
      new Vector3(...n),
    ),
  );
}
function Cell({
  target,
  color,
  active,
}: {
  target: ReturnType<typeof useStore.getState>["config"]["field"]["target"];
  color: string;
  active: boolean;
}) {
  const overlays = useStore((s) => s.overlays);
  const quaternion = useMemo(() => {
    return targetQuaternion(target);
  }, [target]);
  const outline = useMemo(() => targetOpeningPoints(target), [target]);
  return (
    <group position={target.center} quaternion={quaternion}>
      <Line points={outline} color={color} lineWidth={active ? 3 : 2} />
      <Line
        points={outline.map(([x, y]) => [x, y, -target.depth] as Vec3)}
        color={color}
        lineWidth={1}
      />
      {outline.slice(0, -1).map((point, i) => (
        <Line
          key={i}
          points={[point, [point[0], point[1], -target.depth]]}
          color={color}
          lineWidth={1}
        />
      ))}
      {overlays.target && active && (
        <mesh position={[0, 0, -target.depth / 2]}>
          <boxGeometry args={[target.width, target.height, target.depth]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.07}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}
function Target() {
  const field = useStore((s) => s.config.field);
  const h = field.hive;
  const cells = useMemo(() => hiveCells(field), [field]);
  const frameX = h.frameWidth / 2;
  const frameY = h.frameDepth / 2;
  const pivot = h.pivotHeight;
  return (
    <>
      <group>
        {[-frameX, frameX].map((x) => (
          <group key={x}>
            <Line
              points={[
                [x, -frameY, 0.02],
                [x, 0, pivot],
                [x, frameY, 0.02],
              ]}
              color="#7b8588"
              lineWidth={3}
            />
            <Line
              points={[
                [x, -frameY, 0.02],
                [x, frameY, 0.02],
              ]}
              color="#657075"
              lineWidth={2}
            />
          </group>
        ))}
        <Line
          points={[
            [-frameX, 0, pivot],
            [frameX, 0, pivot],
          ]}
          color="#9ca8ab"
          lineWidth={3}
        />
        <Line
          points={[
            [-frameX, -frameY, 0.02],
            [frameX, -frameY, 0.02],
            [frameX, frameY, 0.02],
            [-frameX, frameY, 0.02],
            [-frameX, -frameY, 0.02],
          ]}
          color="#657075"
          lineWidth={2}
        />
      </group>
      {cells.map((cell) => {
        const target = hiveCellTarget(cell, field);
        const color = cell.alliance === "BLUE" ? "#3d8df5" : "#eb5d58";
        return (
          <Cell
            key={cell.id}
            target={target}
            color={color}
            active={cell.active}
          />
        );
      })}
      <Html position={[0, 0, pivot + 0.16]} center className="scene-label">
        COMPETITION <span>HIVE · DEPLOYED 30°</span>
      </Html>
      <Html
        position={targetWorld([0, 0, 0.08], field.target)}
        center
        className="scene-label"
      >
        BLUE <span>ACTIVE CELL</span>
      </Html>
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
  const points = shot.flight.samples.map((s) => s.p);
  const colors =
    history || mode === "status"
      ? undefined
      : shot.flight.samples.map((s) => {
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
  const ref = useRef<Mesh>(null),
    time = useRef(0);
  const reset = useStore((s) => s.playReset);
  useEffect(() => {
    time.current = 0;
  }, [reset, shot]);
  useFrame((_s, dt) => {
    const s = useStore.getState();
    if (s.playing) time.current += dt * s.playSpeed;
    const end = shot.flight.samples.at(-1)!.t;
    if (time.current > end) {
      time.current = end;
      s.set({ playing: false });
    }
    ref.current?.position.set(...sampleAt(shot.flight.samples, time.current).p);
  });
  return (
    <mesh ref={ref} position={shot.origin}>
      <sphereGeometry args={[shot.config.projectile.diameter / 2, 24, 16]} />
      <meshStandardMaterial color="#efcf72" roughness={0.6} />
    </mesh>
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
  const forces = aerodynamicForces(shot.velocity, shot.spin, c);
  const palette = new Color();
  return (
    <>
      <color
        attach="background"
        args={[s.theme === "dark" ? "#192126" : "#dbe2e4"]}
      />
      <ambientLight intensity={1.3} />
      <directionalLight position={[2, -3, 7]} intensity={2} />
      <Camera />
      <Drive />
      <mesh position={[0, 0, -0.04]}>
        <boxGeometry args={[c.field.size + 0.1, c.field.size + 0.1, 0.08]} />
        <meshStandardMaterial color="#343e42" roughness={1} />
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
              color="#515b5b"
              lineWidth={1}
            />
            <Line
              points={[
                [-half, a, 0.002],
                [half, a, 0.002],
              ]}
              color="#515b5b"
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
      <Target />
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
      {s.showTrajectory && (
        <>
          <Trajectory shot={shot} />
          <Ghost shot={shot} />
        </>
      )}
      {s.history.map((h) => (
        <Trajectory
          key={h.id}
          shot={h.shot}
          history
          onClick={() => s.setConfig(structuredClone(h.shot.config))}
        />
      ))}
      {s.overlays.markers && s.showTrajectory && (
        <>
          <mesh position={shot.flight.apex.p}>
            <sphereGeometry args={[0.018, 12, 8]} />
            <meshBasicMaterial color="#f4e8c9" />
          </mesh>
          <Html
            position={add(shot.flight.apex.p, [0, 0, 0.1])}
            center
            className="scene-label"
          >
            APEX <span>{shot.flight.apex.p[2].toFixed(2)} m</span>
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
