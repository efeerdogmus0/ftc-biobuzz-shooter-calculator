import { useMemo } from "react";
import { Html } from "@react-three/drei";
import { Matrix4, Quaternion, Vector3 } from "three";
import type { TargetConfig, Vec3 } from "../physics/types";
import {
  targetBasis,
  targetOpeningPoints,
  targetWorld,
} from "../physics/flight";
import { hiveCells, hiveCellTarget } from "../field/hiveGeometry";
import { useStore } from "../state/store";

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
  // Frame thickness is a visual approximation; the inner opening retains the
  // manual's dimensions and stays aligned with the scoring plane at local Z=0.
  const rim = 0.012;
  return (
    <group name="hive-cell" position={target.center} quaternion={quaternion}>
      {outline.slice(0, -1).map((a, i) => {
        const b = outline[i + 1];
        const dx = b[0] - a[0],
          dy = b[1] - a[1];
        const length = Math.hypot(dx, dy);
        const outward = [((dy / length) * rim) / 2, ((-dx / length) * rim) / 2];
        const start: Vec3 = [a[0] + outward[0], a[1] + outward[1], 0];
        const end: Vec3 = [b[0] + outward[0], b[1] + outward[1], 0];
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
              rotation={[0, 0, Math.atan2(dy, dx) - Math.PI / 2]}
            >
              <boxGeometry args={[0.003, length, target.depth]} />
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

export function HiveModel() {
  const field = useStore((s) => s.config.field);
  const h = field.hive;
  const cells = hiveCells(field);
  const x = h.frameWidth / 2,
    y = h.frameDepth / 2,
    z = h.pivotHeight;
  return (
    <group name="competition-hive">
      {[-x, x].map((side) => (
        <group key={side}>
          <Beam a={[side, -y, 0.025]} b={[side, 0, z]} />
          <Beam a={[side, y, 0.025]} b={[side, 0, z]} />
          <Beam a={[side, -y, 0.025]} b={[side, y, 0.025]} width={0.035} />
          {[-y, y].map((foot) => (
            <mesh key={foot} position={[side, foot, 0.015]}>
              <boxGeometry args={[0.075, 0.1, 0.03]} />
              <meshStandardMaterial color="#444b50" />
            </mesh>
          ))}
        </group>
      ))}
      <Beam a={[-x, 0, z]} b={[x, 0, z]} width={0.032} />
      {cells.map((cell) => {
        const target = hiveCellTarget(cell, field);
        const mount = targetWorld(
          [0, -target.height / 2 - 0.02, -target.depth / 2],
          target,
        );
        const pivot: Vec3 = [cell.center[0], 0, z];
        return (
          <group key={cell.id}>
            <Cell
              target={target}
              color={cell.alliance === "BLUE" ? "#195ace" : "#cd242c"}
            />
            <Beam a={pivot} b={mount} width={0.03} depth={0.035} />
            <mesh position={pivot} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.045, 0.045, 0.05, 20]} />
              <meshStandardMaterial
                color="#626b70"
                metalness={0.6}
                roughness={0.4}
              />
            </mesh>
          </group>
        );
      })}
      <Html position={[0, 0, z - 0.15]} center className="scene-label">
        HIVE <span>30°</span>
      </Html>
    </group>
  );
}
