/**
 * A VRM avatar body for an explorer — @pmndrs/viverse's model layer end to
 * end: `loadCharacterModel` reads the .vrm (three-vrm under the hood), and
 * `loadCharacterAnimation` retargets viverse's bundled idle/walk/run cycles
 * onto the VRM humanoid — so ANY VRM (VRoid, photoreal scans, commissioned
 * avatars) walks our board with the same speed-blended, stride-matched
 * locomotion the built-in explorers use.
 *
 * What carries over from the rigged Quaternius path and what doesn't:
 *  - locomotion: same Locomotion blend, driven by the live tokenSpeeds; the
 *    VRM's springbones (hair, clothes) add secondary motion for free.
 *  - gaze: three-vrm's native lookAt — the EYES track the gaze target the
 *    token's gaze pass (or the haunt cinematic) aims; blink on death via the
 *    VRM expression set.
 *  - reactions/Death clips: VRMs carry no reaction animations — reactions
 *    no-op, and death lays the body down procedurally (like the primitive
 *    fallback figures) with the mixer stilled.
 */
import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  flattenCharacterAnimationOptions,
  loadCharacterAnimation,
  loadCharacterModel,
  IdleAnimationUrl,
  RunAnimationUrl,
  WalkAnimationUrl,
  type CharacterModel,
} from "@pmndrs/viverse";
import { VRM } from "@pixiv/three-vrm";
import { useBeats } from "../state/beats";
import { MAX_FRAME_DT } from "./followCam";
import { avatarHandles } from "./avatarRegistry";
import { Locomotion } from "./locomotion";
import { tokenSpeeds } from "./walk";

interface Rig {
  model: CharacterModel;
  vrm: VRM | null;
  loco: Locomotion;
  gazeTarget: THREE.Object3D;
}

const GAZE_SCRATCH = new THREE.Vector3();

export function VrmAvatar({
  url,
  h,
  tokenId,
  dead,
}: {
  url: string;
  /** Character height (world units) to scale the avatar to. */
  h: number;
  tokenId?: string;
  dead?: boolean;
}) {
  const [rig, setRig] = useState<Rig | null>(null);
  const gazeOn = useRef(false);

  useEffect(() => {
    let live = true;
    const mark = (s: string) => {
      const w = window as unknown as { __vrmDebug?: string[] };
      (w.__vrmDebug ??= []).push(`${s} @${Math.round(performance.now())}`);
    };
    (async () => {
      try {
        mark("load:start");
        // "default" → viverse's bundled mannequin (its animations' home rig);
        // a real URL ending in .vrm goes through three-vrm.
        const model = await loadCharacterModel(url === "default" ? undefined : url);
        mark("model:loaded");
        const [idleClip, walkClip, runClip] = await Promise.all([
          loadCharacterAnimation(model, ...flattenCharacterAnimationOptions({ url: IdleAnimationUrl })),
          loadCharacterAnimation(
            model,
            ...flattenCharacterAnimationOptions({ url: WalkAnimationUrl, scaleTime: 0.5 }),
          ),
          loadCharacterAnimation(
            model,
            ...flattenCharacterAnimationOptions({ url: RunAnimationUrl, scaleTime: 0.8 }),
          ),
        ]);
        mark(`clips:loaded live=${live}`);
        if (!live) return;
        // Scale to the character's height and drop the feet to the origin —
        // model.height is measured from the bind pose by loadCharacterModel.
        const s = h / (model.height || 1.6);
        model.scene.scale.setScalar(s);
        model.scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model.scene);
        if (isFinite(box.min.y)) model.scene.position.y -= box.min.y;

        const loco = new Locomotion({
          Idle: model.mixer.clipAction(idleClip),
          Walk: model.mixer.clipAction(walkClip),
          Run: model.mixer.clipAction(runClip),
        });
        const vrm = model instanceof VRM ? model : null;
        const gazeTarget = new THREE.Object3D();
        model.scene.add(gazeTarget);
        setRig({ model, vrm, loco, gazeTarget });
        mark("rig:set");
      } catch (e) {
        mark(`error:${String(e).slice(0, 120)}`);
        console.warn(`[vrm] could not load avatar ${url} — falling back to nothing`, e);
      }
    })();
    return () => {
      live = false;
    };
  }, [url, h]);

  // Own the locomotion clips (effect-shaped for the StrictMode remount).
  useEffect(() => (rig ? rig.loco.own() : undefined), [rig]);

  // Publish the registry handle: eyes track the gaze pass; reactions no-op
  // (VRMs carry no reaction clips — same net effect as the primitive figures).
  useEffect(() => {
    if (!rig || !tokenId) return;
    const { vrm, gazeTarget, model } = rig;
    const life = {
      dead: false,
      update: () => {},
      setGaze: (v: THREE.Vector3 | null) => {
        if (!vrm?.lookAt) return;
        if (v) {
          gazeTarget.position.copy(model.scene.worldToLocal(GAZE_SCRATCH.copy(v)));
          if (!gazeOn.current) {
            vrm.lookAt.target = gazeTarget;
            gazeOn.current = true;
          }
        } else if (gazeOn.current) {
          vrm.lookAt.target = undefined;
          vrm.lookAt.reset();
          gazeOn.current = false;
        }
      },
    };
    const handle = { life, playOneShot: () => {} };
    avatarHandles.set(tokenId, handle);
    return () => {
      if (avatarHandles.get(tokenId) === handle) avatarHandles.delete(tokenId);
    };
  }, [rig, tokenId]);

  // Death: no clip to play — lay the body where it fell and still the mixer.
  useEffect(() => {
    if (!rig || !dead) return;
    rig.model.scene.rotation.x = -Math.PI / 2;
    rig.model.scene.position.y += 0.12;
    rig.vrm?.expressionManager?.setValue("blink", 1);
    return () => {
      rig.model.scene.rotation.x = 0;
      rig.model.scene.position.y -= 0.12;
      rig.vrm?.expressionManager?.setValue("blink", 0);
    };
  }, [rig, dead]);

  useFrame((_, dt) => {
    if (!rig) return;
    if (useBeats.getState().worldFrozen) return; // hold the pose with the world
    const d = Math.min(MAX_FRAME_DT, dt);
    if (!dead) {
      const speed = tokenId != null ? (tokenSpeeds.get(tokenId) ?? 0) : 0;
      rig.loco.update(d, speed, "Idle", null);
      rig.model.mixer.update(d);
    }
    // springbones + lookAt + expressions keep settling even for the fallen
    rig.vrm?.update(d);
  });

  return rig ? <primitive object={rig.model.scene} /> : null;
}
