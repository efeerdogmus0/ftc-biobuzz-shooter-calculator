import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import {
  Matrix4,
  Quaternion,
  Vector3,
  Shape,
  DoubleSide,
  Vector2,
  type Group,
} from "three";
import type { TargetConfig, Vec3, Shot } from "../physics/types";
import { sampleHive } from "../physics/hiveDynamics";
import { targetBasis, targetOpeningPoints } from "../physics/flight";
import { hiveCells, hiveCellTarget } from "../field/hiveGeometry";
import { useStore } from "../state/store";
import { cellSurfaces } from "../physics/cellGeometry";
import { hiveStructure } from "../field/hiveStructure";

/** Rectangular structural member, with its length along local Y. */
function Beam({
  a,
  b,
  width = 0.0254,
  depth = width,
  color = "#a8b0b3",
}: {
  a: Vec3;
  b: Vec3;
  width?: number;
  depth?: number;
  color?: string;
}) {
  const delta = new Vector3(...b).sub(new Vector3(...a));
  const rotation = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    delta.clone().normalize(),
  );
  return (
    <mesh
      position={new Vector3(...a).addScaledVector(delta, 0.5)}
      quaternion={rotation}
    >
      <boxGeometry args={[width, delta.length(), depth]} />
      <meshStandardMaterial color={color} metalness={0.45} roughness={0.45} />
    </mesh>
  );
}

function Cell({ target, color }: { target: TargetConfig; color: string }) {
  const quaternion = useMemo(() => {
    const { u, v, n } = targetBasis(target);
    return new Quaternion().setFromRotationMatrix(
      new Matrix4().makeBasis(
        new Vector3(...u),
        new Vector3(...v),
        new Vector3(...n),
      ),
    );
  }, [target]);
  const outline = targetOpeningPoints(target);
  const rim = target.thickness;
  const bottomShape = new Shape(
    outline.slice(0, -1).map((p) => new Vector2(p[0], p[1])),
  );

  return (
    <group name="hive-cell" position={target.center} quaternion={quaternion}>
      <mesh name="CELL bottom panel" position={[0, 0, -target.depth - rim]}>
        <extrudeGeometry
          args={[bottomShape, { depth: rim, bevelEnabled: false }]}
        />
        <meshStandardMaterial
          color="#c2e4ef"
          side={DoubleSide}
          transparent
          opacity={0.23}
          depthWrite={false}
        />
      </mesh>
      {cellSurfaces(target).map((surface, i) => {
        const half = (surface.size[0] - rim) / 2;
        const dx = half * Math.cos(surface.angle),
          dy = half * Math.sin(surface.angle);
        const start: Vec3 = [surface.center[0] - dx, surface.center[1] - dy, 0];
        const end: Vec3 = [surface.center[0] + dx, surface.center[1] + dy, 0];
        return (
          <group key={i}>
            {[0, -target.depth].map((z) => (
              <Beam
                key={z}
                a={[start[0], start[1], z]}
                b={[end[0], end[1], z]}
                width={rim}
                depth={rim}
                color={color}
              />
            ))}
            <mesh
              name="hive-cell-panel"
              position={[
                (start[0] + end[0]) / 2,
                (start[1] + end[1]) / 2,
                -target.depth / 2,
              ]}
              rotation={[0, 0, surface.angle]}
            >
              <boxGeometry
                args={[surface.size[0], surface.size[1], surface.size[2]]}
              />
              <meshStandardMaterial
                color="#dce7eb"
                transparent
                opacity={0.3}
                depthWrite={false}
                roughness={0.35}
                metalness={0.05}
              />
            </mesh>
            <Beam
              a={start}
              b={[start[0], start[1], -target.depth]}
              width={0.008}
              color="#a7adb0"
            />
          </group>
        );
      })}
    </group>
  );
}

export function HiveModel({ shot }: { shot: Shot }) {
  const field = useStore((s) => s.config.field);
  const close = useStore((s) => s.view === "CELL" || s.view === "HIVE");
  const structure = hiveStructure(field);
  const cells = hiveCells(field);
  const moving = useRef<Group>(null);
  const axis = targetBasis(field.target).u;
  const pivot: Vec3 = [field.target.center[0], 0, field.hive.pivotHeight];
  useFrame(() => {
    const h = sampleHive(
      shot.flight.hiveTrack ?? [],
      useStore.getState().playbackTime,
    );
    moving.current?.quaternion.setFromAxisAngle(
      new Vector3(...axis),
      h?.angle ?? 0,
    );
  });
  return (
    <group name="competition-hive">
      {structure.beams
        .filter((b) => !b.moving)
        .map((beam) => (
          <Beam key={beam.name} {...beam} />
        ))}
      {structure.feet.map((foot) => (
        <mesh key={foot.name} position={foot.center}>
          <boxGeometry args={foot.size} />
          <meshStandardMaterial color="#444b50" />
        </mesh>
      ))}
      {[false, true].map((blue) => (
        <group
          key={String(blue)}
          ref={blue ? moving : undefined}
          position={blue ? pivot : [0, 0, 0]}
        >
          <group position={blue ? (pivot.map((x) => -x) as Vec3) : [0, 0, 0]}>
            {blue &&
              structure.beams
                .filter((b) => b.moving)
                .map((beam) => <Beam key={beam.name} {...beam} />)}
            {structure.hubs
              .filter((h) => h.moving === blue)
              .map((hub) => (
                <mesh
                  key={hub.name}
                  position={hub.center}
                  rotation={[0, 0, Math.PI / 2]}
                >
                  <cylinderGeometry
                    args={[hub.radius, hub.radius, hub.length, 20]}
                  />
                  <meshStandardMaterial
                    color="#626b70"
                    metalness={0.6}
                    roughness={0.4}
                  />
                </mesh>
              ))}
            {cells
              .filter(
                (cell) =>
                  (cell.alliance === "BLUE") === blue &&
                  (!close || cell.alliance === "BLUE"),
              )
              .map((cell) => {
                const target = hiveCellTarget(cell, field);
                return (
                  <group key={cell.id}>
                    <Cell
                      target={target}
                      color={cell.alliance === "BLUE" ? "#195ace" : "#cd242c"}
                    />
                  </group>
                );
              })}
          </group>
        </group>
      ))}
      <Html
        position={[0, 0, field.hive.pivotHeight - 0.15]}
        center
        className="scene-label"
      >
        HIVE <HiveAngle shot={shot} />
      </Html>
    </group>
  );
}
function HiveAngle({ shot }: { shot: Shot }) {
  const time = useStore((s) => s.playbackTime),
    h = sampleHive(shot.flight.hiveTrack ?? [], time);
  return (
    <span>{h ? ((h.angle * 180) / Math.PI - 30).toFixed(1) : "-30"}°</span>
  );
}
