import { useMemo } from "react";
import { Path, Shape } from "three";
import {
  flowerDimensions as d,
  flowerPlacements,
} from "../field/flowerGeometry";
import { useStore } from "../state/store";

function Ring({
  inner,
  z,
  thickness,
  color,
}: {
  inner: number;
  z: number;
  thickness: number;
  color: string;
}) {
  const shape = useMemo(() => {
    const outline = new Shape();
    // Rounded ring body represented by an octagonal flange with an open bore.
    for (let i = 0; i <= 8; i++) {
      const angle = Math.PI / 8 + (i * Math.PI) / 4;
      const x = d.outerRadius * Math.cos(angle),
        y = d.outerRadius * Math.sin(angle);
      if (i === 0) outline.moveTo(x, y);
      else outline.lineTo(x, y);
    }
    const hole = new Path();
    hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
    outline.holes.push(hole);
    return outline;
  }, [inner]);
  return (
    <mesh position={[0, 0, z]}>
      <extrudeGeometry
        args={[
          shape,
          { depth: thickness, bevelEnabled: false, curveSegments: 40 },
        ]}
      />
      <meshStandardMaterial color={color} roughness={0.5} />
    </mesh>
  );
}

function Flower() {
  const middle = d.bottomThickness + d.retrievalHeight;
  const pipeBottom = middle + d.ringThickness;
  const pipeTop = d.openingHeight - d.ringThickness;
  const backstopZ = d.openingHeight + d.backstopHeight;
  return (
    <>
      <Ring
        inner={d.bottomOpeningRadius}
        z={0}
        thickness={d.bottomThickness}
        color="#252a2e"
      />
      <Ring
        inner={d.openingRadius}
        z={middle}
        thickness={d.ringThickness}
        color="#252a2e"
      />
      <Ring
        inner={d.openingRadius}
        z={pipeTop}
        thickness={d.ringThickness}
        color="#e4b653"
      />
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((y) => (
          <group
            key={`${x}-${y}`}
            position={[x * d.pipeOffset, y * d.pipeOffset, 0]}
          >
            <mesh
              position={[0, 0, (pipeBottom + pipeTop) / 2]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry
                args={[d.pipeRadius, d.pipeRadius, pipeTop - pipeBottom, 16]}
              />
              <meshStandardMaterial color="#75a944" roughness={0.4} />
            </mesh>
            {[pipeBottom + 0.009, pipeTop - 0.009].map((z, i) => (
              <mesh key={z} position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.012, 0.012, 0.018, 16]} />
                <meshStandardMaterial color={i ? "#e4b653" : "#252a2e"} />
              </mesh>
            ))}
          </group>
        )),
      )}
      {[-1, 1].map((side) => (
        <group key={side}>
          {/* Rear supports leave the floor-level retrieval opening unobstructed. */}
          <mesh
            position={[
              side * d.pipeOffset,
              d.pipeOffset,
              d.bottomThickness + d.retrievalHeight / 2,
            ]}
          >
            <boxGeometry args={[0.013, 0.013, d.retrievalHeight]} />
            <meshStandardMaterial
              color="#a8adb0"
              metalness={0.5}
              roughness={0.4}
            />
          </mesh>
          <mesh
            position={[
              side * 0.058,
              0.015,
              d.openingHeight + d.backstopHeight / 2,
            ]}
          >
            <boxGeometry args={[0.005, 0.005, d.backstopHeight]} />
            <meshStandardMaterial color="#c4c7c7" />
          </mesh>
          <mesh position={[side * 0.044, d.outerRadius - 0.006, 0.25]}>
            <boxGeometry args={[0.025, 0.018, 0.015]} />
            <meshStandardMaterial
              color="#8b9295"
              metalness={0.5}
              roughness={0.4}
            />
          </mesh>
        </group>
      ))}
      {/* Raised, three-sided backstop on the wall side; front stays open. */}
      {[0, 1, 2].map((i) => {
        const a = (i * Math.PI) / 3,
          b = ((i + 1) * Math.PI) / 3;
        const ax = Math.cos(a) * 0.058,
          ay = Math.sin(a) * 0.058 + 0.015;
        const bx = Math.cos(b) * 0.058,
          by = Math.sin(b) * 0.058 + 0.015;
        return (
          <mesh
            key={i}
            position={[(ax + bx) / 2, (ay + by) / 2, backstopZ - 0.003]}
            rotation={[0, 0, Math.atan2(by - ay, bx - ax)]}
          >
            <boxGeometry
              args={[Math.hypot(bx - ax, by - ay) + 0.004, 0.009, 0.006]}
            />
            <meshStandardMaterial color="#834e96" roughness={0.4} />
          </mesh>
        );
      })}
    </>
  );
}

export function Flowers() {
  const size = useStore((s) => s.config.field.size);
  return (
    <group name="field-flowers">
      {flowerPlacements(size).map((f) => (
        <group
          key={f.id}
          name={f.id}
          position={f.position}
          rotation={[0, 0, f.yaw]}
        >
          <Flower />
        </group>
      ))}
    </group>
  );
}
