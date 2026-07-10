import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { attachKeepsake, refineExplorerAvatar, attachAvatarLife, REACTION_CLIPS } from "@dread-hollow/decor";
import * as THREE from "three";
import { useBeats } from "../state/beats";
import { MAX_FRAME_DT } from "./followCam";
import { markActive } from "./governor";
import { avatarHandles, type OneShotKind } from "./avatarRegistry";
import { Locomotion } from "./locomotion";
import { tokenSpeeds, WALK_SPEED } from "./walk";
import type { AvatarEntry } from "./avatars";

/** One-shot reactions that may interrupt a softer one already playing. */
const OVERRIDE: ReadonlySet<OneShotKind> = new Set(["hit", "stagger"]);

/** Resolve a reaction kind to a concrete clip name (attack alternates hands). */
function reactionClip(kind: OneShotKind): string {
  const c = REACTION_CLIPS[kind];
  return typeof c === "string" ? c : c[Math.floor(Math.random() * c.length)]!;
}

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
  tokenId,
}: {
  entry: AvatarEntry;
  archetype?: string;
  moving?: boolean;
  dead?: boolean;
  /** Player id — this avatar publishes its gaze/reaction controls here. */
  tokenId?: string;
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

  // World freeze: while a modal beat is up the clips hold their exact pose —
  // timeScale 0 zeroes the mixer's own frame updates without losing clip time.
  const frozen = useBeats((s) => s.worldFrozen);
  useEffect(() => {
    mixer.timeScale = frozen ? 0 : 1;
  }, [mixer, frozen]);

  // The life layer: breathing, attention drift, blinks, relaxed hands —
  // additive AFTER the mixer (useAnimations subscribed its frame callback
  // first, so ours runs later in the same tick) so the clips still win.
  const life = useMemo(() => attachAvatarLife(obj, archetype), [obj, archetype]);
  useEffect(() => {
    life.dead = !!dead;
  }, [life, dead]);

  // Hang the keepsake once, AFTER settling the skeleton out of its T-pose bind
  // stance — the attach transform reads the bone's current pose. (Force a live
  // timeScale for the one-off pose update in case we mount mid-freeze.)
  useEffect(() => {
    if (!archetype) return;
    actions["Idle"]?.reset().play();
    const ts = mixer.timeScale;
    mixer.timeScale = 1;
    mixer.update(0.03);
    mixer.timeScale = ts;
    const prop = attachKeepsake(obj, archetype);
    return () => {
      prop?.removeFromParent();
    };
  }, [actions, mixer, obj, archetype]);

  // Idle variety: a slow timer occasionally swaps the resting clip between the
  // two idles so six explorers standing together don't loop in lockstep.
  const [idleClip, setIdleClip] = useState<"Idle" | "Idle_Neutral">("Idle");
  useEffect(() => {
    let live = true;
    let h: ReturnType<typeof setTimeout>;
    const schedule = () => {
      h = setTimeout(() => {
        if (!live) return;
        if (Math.random() < 0.35) setIdleClip((c) => (c === "Idle" ? "Idle_Neutral" : "Idle"));
        schedule();
      }, 9000 + Math.random() * 7000);
    };
    schedule();
    return () => {
      live = false;
      clearTimeout(h);
    };
  }, []);

  // The body's continuous story: a 1D locomotion blend (idle ↔ walk ↔ run)
  // driven by LIVE ground speed published by the parent token — the envelope's
  // ramps play out through the blend and stride rate, so feet grip the floor
  // instead of skating. Death and one-shot reactions "hold" the blend down
  // while they own the body; it recovers on its own when they let go.
  const loco = useMemo(() => new Locomotion(actions), [actions]);
  const oneShotRef = useRef<THREE.AnimationAction | null>(null);
  const oneShotKindRef = useRef<OneShotKind | null>(null);

  // Death wins over everything: played once, frozen on the floor.
  useEffect(() => {
    if (!dead) return;
    const death = actions["Death"];
    if (!death) return;
    death.reset();
    death.setLoop(THREE.LoopOnce, 1);
    death.clampWhenFinished = true;
    death.fadeIn(0.25).play();
    return () => {
      death.fadeOut(0.2);
    };
  }, [actions, dead]);

  // Locomotion + life, one pass: read the token's live speed straight from
  // the walk registry (no React state on the per-frame path).
  useFrame((_, dt) => {
    if (useBeats.getState().worldFrozen) return; // hold the pose with the mixer
    const d = Math.min(MAX_FRAME_DT, dt);
    const speed = tokenId != null
      ? (tokenSpeeds.get(tokenId) ?? 0)
      : moving ? WALK_SPEED : 0; // registry-less preview fallback
    loco.update(d, dead ? 0 : speed, idleClip, !!dead || oneShotRef.current != null);
    life.update(d);
  });

  // A reaction clip finished → let the locomotion blend take the body back.
  useEffect(() => {
    const onFinished = (e: { action: THREE.AnimationAction }) => {
      if (e.action !== oneShotRef.current) return; // Death also fires 'finished'
      oneShotRef.current = null;
      oneShotKindRef.current = null;
      e.action.fadeOut(0.25);
    };
    mixer.addEventListener("finished", onFinished);
    return () => mixer.removeEventListener("finished", onFinished);
  }, [mixer]);

  // Imperative reaction trigger, published in the registry under tokenId. Kept
  // in a ref so the registered handle stays stable while closing over the
  // latest actions/clip state.
  const playRef = useRef<(kind: OneShotKind) => void>(() => {});
  playRef.current = (kind: OneShotKind) => {
    if (dead) return; // the fallen don't react
    if (oneShotRef.current && !OVERRIDE.has(kind)) return; // softer beat can't cut in
    const action = actions[reactionClip(kind)];
    if (!action) return;
    // The locomotion blend sees oneShotRef and ducks itself — only a previous
    // reaction needs fading out by hand.
    if (oneShotRef.current && oneShotRef.current !== action) oneShotRef.current.fadeOut(0.1);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = false;
    action.fadeIn(0.15).play();
    oneShotRef.current = action;
    oneShotKindRef.current = kind;
    markActive(1400); // new motion — render at full rate, not the idle cadence
  };

  useEffect(() => {
    if (!tokenId) return;
    const handle = { life, playOneShot: (k: OneShotKind) => playRef.current(k) };
    avatarHandles.set(tokenId, handle);
    return () => {
      if (avatarHandles.get(tokenId) === handle) avatarHandles.delete(tokenId);
    };
  }, [tokenId, life]);

  return <primitive object={obj} />;
}
