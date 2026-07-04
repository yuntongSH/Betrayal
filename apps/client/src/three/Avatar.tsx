import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { attachKeepsake, refineExplorerAvatar, attachAvatarLife } from "@dread-hollow/decor";
import * as THREE from "three";
import type { AvatarEntry } from "./avatars";

/** Face, hair and eyes keep their natural colour — identity tint lands on
 *  clothing only, so nobody's skin looks dyed. */
const PERSON_MATS = /skin|hair|eyebrow|eye|beard|teeth/i;

/**
 * A clothed, rigged CC0 human (Quaternius) loaded as a glTF: cloned per-instance
 * (skeleton-aware), grounded and scaled to the character's height, clothes
 * gently tinted toward its identity colour, shadow-casting, carrying the
 * character's signature keepsake on a bone (Thorne's camera, Tobias's lantern…).
 *
 * The body acts the story out: Idle at rest, Walk while the parent token glides
 * between rooms, and Death — played once, frozen on the floor — when the house
 * takes them. The parent PlayerToken group still handles glide and facing.
 */
export function Avatar({
  entry,
  archetype,
  moving,
  dead,
}: {
  entry: AvatarEntry;
  archetype?: string;
  moving?: boolean;
  dead?: boolean;
}) {
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
          if (c.color && !PERSON_MATS.test(c.name || "")) c.color.lerp(new THREE.Color(entry.tint), 0.3);
          return c;
        });
        mesh.material = Array.isArray(mesh.material) ? tinted : tinted[0]!;
      }
    });
    // Realism pass: smoothed normals, physical materials, per-character
    // grooming, eyelids. Runs after the tint (which it preserves) and before
    // the height fit (its build broadening changes the silhouette).
    refineExplorerAvatar(m, archetype);
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
  }, [scene, entry, archetype]);

  const { actions, mixer } = useAnimations(animations, obj);

  // The life layer: breathing, attention drift, blinks, relaxed hands —
  // additive AFTER the mixer (useAnimations subscribed its frame callback
  // first, so ours runs later in the same tick) so the clips still win.
  const life = useMemo(() => attachAvatarLife(obj, archetype), [obj, archetype]);
  useEffect(() => {
    life.dead = !!dead;
  }, [life, dead]);
  useFrame((_, dt) => life.update(Math.min(0.05, dt)));

  // Hang the keepsake once, AFTER settling the skeleton out of its T-pose bind
  // stance — the attach transform reads the bone's current pose.
  useEffect(() => {
    if (!archetype) return;
    actions["Idle"]?.reset().play();
    mixer.update(0.03);
    const prop = attachKeepsake(obj, archetype);
    return () => {
      prop?.removeFromParent();
    };
  }, [actions, mixer, obj, archetype]);

  // The story state machine: Death wins, Walk while gliding, Idle otherwise.
  const clip = dead ? "Death" : moving ? "Walk" : "Idle";
  useEffect(() => {
    const action = actions[clip] ?? actions["Idle"] ?? Object.values(actions)[0];
    if (!action) return;
    if (clip === "Death") {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    action.reset().fadeIn(0.25).play();
    return () => {
      action.fadeOut(0.25);
    };
  }, [actions, clip]);

  return <primitive object={obj} />;
}
