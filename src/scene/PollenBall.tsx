import { useMemo, useEffect } from "react";
import {
  BackSide,
  FrontSide,
  DoubleSide,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from "three";
import type { BounceSettings } from "../physics/types";
import { holeAxes, shapeAxes } from "../physics/pollenShape";
import { pollenHoleRatio, pollenInnerRatio } from "../physics/pollenGeometry";
export function PollenBall({
  radius,
  color,
  settings,
}: {
  radius: number;
  color: string;
  settings: BounceSettings;
}) {
  const holes = useMemo(() => holeAxes(settings), [settings]);
  const materials = useMemo(() => {
    const make = (inner: boolean) => {
      const material = new MeshStandardMaterial({
        color,
        roughness: 0.57,
        metalness: 0.02,
        side: inner ? BackSide : FrontSide,
        emissive: color,
        emissiveIntensity: 0.035,
      });
      material.onBeforeCompile = (shader) => {
        shader.uniforms.pollenHoles = {
          value: holes.map((v) => new Vector3(...v)),
        };
        shader.uniforms.holeRadius = { value: pollenHoleRatio };
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 pollenPosition;",
          )
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\npollenPosition=position;",
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 pollenPosition;\nuniform vec3 pollenHoles[26];\nuniform float holeRadius;",
          )
          .replace(
            "#include <clipping_planes_fragment>",
            `#include <clipping_planes_fragment>
          for(int i=0;i<26;i++){
            float axial=dot(pollenPosition,pollenHoles[i]);
            if(axial>0.0 && length(pollenPosition-pollenHoles[i]*axial)<holeRadius) discard;
          }`,
          );
      };
      material.customProgramCacheKey = () => `pollen-shell-${inner}`;
      return material;
    };
    return [make(false), make(true)];
  }, [color, holes]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  const axes = shapeAxes(settings),
    outer = Math.sqrt(1 - pollenHoleRatio ** 2),
    inner = Math.sqrt(pollenInnerRatio ** 2 - pollenHoleRatio ** 2);
  return (
    <group scale={axes.map((v) => v * radius) as [number, number, number]}>
      <mesh material={materials[0]}>
        <sphereGeometry args={[1, 48, 32]} />
      </mesh>
      <mesh material={materials[1]}>
        <sphereGeometry args={[pollenInnerRatio, 48, 32]} />
      </mesh>
      {holes.map((h, i) => (
        <mesh
          key={i}
          position={
            h.map((v) => (v * (outer + inner)) / 2) as [number, number, number]
          }
          quaternion={new Quaternion().setFromUnitVectors(
            new Vector3(0, 1, 0),
            new Vector3(...h),
          )}
        >
          <cylinderGeometry
            args={[
              pollenHoleRatio,
              pollenHoleRatio,
              outer - inner,
              16,
              1,
              true,
            ]}
          />
          <meshStandardMaterial
            color={color}
            roughness={0.7}
            side={DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
