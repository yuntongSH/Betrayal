import { useEffect, useMemo } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import type { AvatarEntry } from "./avatars";

/**
 * A clothed, rigged CC0 human (Quaternius) loaded as a glTF: cloned per-instance
 * (skeleton-aware), grounded and scaled to the character's height, gently tinted
 * toward its identity colour, shadow-casting, with its Idle clip playing. The
 * parent PlayerToken group still handles room-to-room glide and facing.
 */
export function Avatar({ entry }: { entry: AvatarEntry }) {
  const { scene, animations } = useGLTF(entry.url);

  const obj = useMemo(() => {
    const m = cloneSkinned(scene);
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!(mesh as { isMesh?: boolean }).isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      if (entry.tint != null) {
        const src = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const tinted = src.map((x) => {
          const c = (x as THREE.Material).clone() as THREE.MeshStandardMaterial;
          if (c.color) c.color.lerp(new THREE.Color(entry.tint), 0.28);
          return c;
        });
        mesh.material = Array.isArray(mesh.material) ? tinted : tinted[0];
      }
    });
    // Scale to the character's height and drop the feet to the origin. Skinned
    // bounds settle once matrices update; clamp a degenerate box to ~1.8.
    m.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(m);
    let size = box.max.y - box.min.y;
    if (!(size > 0.3 && size < 6)) size = 1.8;
    m.scale.setScalar(entry.h / size);
    m.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(m);
    if (isFinite(box.min.y)) m.position.y -= box.min.y;
    return m;
  }, [scene, entry]);

  const { actions } = useAnimations(animations, obj);
  useEffect(() => {
    const idle = actions["Idle"] ?? Object.values(actions)[0];
    idle?.reset().fadeIn(0.25).play();
    return () => {
      idle?.fadeOut(0.2);
    };
  }, [actions]);

  return <primitive object={obj} />;
}
