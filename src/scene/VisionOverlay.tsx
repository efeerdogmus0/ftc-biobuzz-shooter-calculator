// Limelight in the 3D field: the lens and its view frustum on the robot, the
// sixteen AprilTags under the CELLS (green when seen from the current pose)
// and the visibility map on the floor.
import { useEffect, useMemo } from "react";
import { Html, Line } from "@react-three/drei";
import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  DoubleSide,
  NearestFilter,
  RGBAFormat,
} from "three";
import { useStore } from "../state/store";
import { add, scale } from "../physics/math";
import type { Vec3 } from "../physics/types";
import {
  cameraErrors,
  lens,
  robotCameraPose,
  viewAll,
  visionScene,
  type VisionMap,
} from "../vision/limelight";
import type { AprilTag } from "../vision/aprilTags";

const RANGE = 2.2;

function TagQuad({ tag, seen }: { tag: AprilTag; seen: boolean }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    // Lift a millimetre off the CELL wall so it is not hidden by it.
    const c = tag.corners.map((p) => add(p, scale(tag.normal, 0.002)));
    g.setAttribute(
      "position",
      new BufferAttribute(
        new Float32Array([
          ...c[0],
          ...c[1],
          ...c[2],
          ...c[0],
          ...c[2],
          ...c[3],
        ]),
        3,
      ),
    );
    return g;
  }, [tag]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        color={seen ? "#2fa35a" : "#1d2228"}
        side={DoubleSide}
      />
    </mesh>
  );
}

function mapColor(map: VisionMap, value: number): [number, number, number] {
  if (map.mode === "anyHeading") {
    if (value <= 0) return [189, 99, 94];
    if (value < 0.5) return [231, 178, 63];
    return [47, 163, 90];
  }
  if (value <= 0) return [189, 99, 94];
  if (value === 1) return [231, 178, 63];
  if (value < 4) return [120, 190, 95];
  return [40, 140, 75];
}

function FloorMap({ map }: { map: VisionMap }) {
  const n = map.count + 1;
  const texture = useMemo(() => {
    const data = new Uint8Array(n * n * 4);
    for (const cell of map.cells) {
      const i = Math.round((cell.x - map.start) / map.spacing),
        j = Math.round((cell.y - map.start) / map.spacing),
        k = (j * n + i) * 4,
        [r, g, b] = mapColor(map, cell.value);
      data[k] = r;
      data[k + 1] = g;
      data[k + 2] = b;
      data[k + 3] = 150;
    }
    const tex = new DataTexture(data, n, n, RGBAFormat);
    tex.magFilter = NearestFilter;
    tex.minFilter = NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }, [map, n]);
  useEffect(() => () => texture.dispose(), [texture]);
  const size = n * map.spacing,
    center = map.start + (map.count * map.spacing) / 2;
  return (
    <mesh position={[center, center, 0.01]}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

export function VisionOverlay() {
  const camera = useStore((s) => s.camera),
    config = useStore((s) => s.config),
    map = useStore((s) => s.visionMap),
    mode = useStore((s) => s.visionMode);
  const scene = useMemo(() => visionScene(config.field), [config.field]);
  if (!camera || !camera.enabled || cameraErrors(camera).length) return null;
  const pose = robotCameraPose(camera, config);
  const views = viewAll(pose, camera, scene);
  const L = lens(camera);
  const tx = Math.tan(L.hfov / 2),
    ty = Math.tan(L.vfov / 2);
  const far = (sx: number, sy: number): Vec3 =>
    add(
      pose.position,
      scale(
        add(
          pose.forward,
          add(scale(pose.right, sx * tx), scale(pose.up, sy * ty)),
        ),
        RANGE,
      ),
    );
  const rect = [far(-1, -1), far(1, -1), far(1, 1), far(-1, 1)];
  return (
    <group>
      <mesh position={pose.position}>
        <boxGeometry args={[0.045, 0.045, 0.045]} />
        <meshStandardMaterial color="#1f2a33" />
      </mesh>
      {rect.map((p, i) => (
        <Line
          key={i}
          points={[pose.position, p]}
          color="#3f8fd8"
          lineWidth={1}
          transparent
          opacity={0.7}
        />
      ))}
      <Line
        points={[...rect, rect[0]]}
        color="#3f8fd8"
        lineWidth={1}
        transparent
        opacity={0.7}
      />
      {scene.tags.map((tag, i) => {
        const seen = views[i].reason === "seen";
        return (
          <group key={tag.id}>
            <TagQuad tag={tag} seen={seen} />
            {seen && (
              <Line
                points={[pose.position, tag.center]}
                color="#2fa35a"
                lineWidth={1.5}
              />
            )}
            <Html
              position={add(tag.center, scale(tag.normal, 0.05))}
              center
              className={`scene-label tag-label ${seen ? "seen" : ""}`}
            >
              {tag.id}
            </Html>
          </group>
        );
      })}
      {mode !== "off" && map && <FloorMap map={map} />}
    </group>
  );
}
