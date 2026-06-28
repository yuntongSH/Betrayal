import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../state/store";
import { roomWorld } from "./layout";

/**
 * Cinematic camera-follow: each frame the orbit target eases toward the active
 * player's room (including on bot turns — "watch the action"), and, while the
 * user isn't actively orbiting, the camera also dollies IN along its current
 * angle so whoever is up is framed close — leaning a little tighter on a bot's
 * turn. The user's chosen angle is preserved, and grabbing the camera pauses the
 * auto-follow for a beat so the dolly never fights a manual orbit/zoom.
 */
export function CameraDirector() {
  const game = useStore((s) => s.game);
  const { camera, controls } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    controls:
      | {
          target?: THREE.Vector3;
          minDistance?: number;
          maxDistance?: number;
          addEventListener?: (type: string, fn: () => void) => void;
          removeEventListener?: (type: string, fn: () => void) => void;
        }
      | null;
  };
  const desired = useRef(new THREE.Vector3(0, 0, 4));
  const offset = useRef(new THREE.Vector3());
  const userCamAt = useRef(0);

  useEffect(() => {
    if (!controls) return;
    const onStart = () => {
      userCamAt.current = performance.now();
    };
    controls.addEventListener?.("start", onStart);
    return () => controls.removeEventListener?.("start", onStart);
  }, [controls]);

  useFrame(() => {
    if (!game || !controls?.target) return;
    const active = game.players.find((p) => p.id === game.activePlayerId);
    const room = active?.position ? game.house[active.position] : undefined;
    if (room) {
      const [x, y, z] = roomWorld(room);
      desired.current.set(x, y + 0.7, z);
    }
    controls.target.lerp(desired.current, 0.06);

    if (performance.now() - userCamAt.current > 2500) {
      offset.current.copy(camera.position).sub(controls.target);
      const dist = offset.current.length();
      const min = controls.minDistance ?? 6;
      const max = controls.maxDistance ?? 60;
      const want = Math.max(min, Math.min(max, active?.isBot ? 9.5 : 11.5));
      offset.current.multiplyScalar((dist + (want - dist) * 0.035) / Math.max(0.0001, dist));
      camera.position.copy(controls.target).add(offset.current);
    }
  });

  return null;
}
