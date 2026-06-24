import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../state/store";
import { roomWorld } from "./layout";

/**
 * Soft camera follow: each frame the OrbitControls target eases toward the
 * active player's room so whoever is up stays roughly centered — including on
 * bot turns, which gives the table a "watch the action" feel. The lerp is
 * gentle (and only touches `target`, never the camera angle/zoom) so the user
 * can still orbit and pan freely; the follow just nudges, it doesn't seize.
 */
export function CameraDirector() {
  const game = useStore((s) => s.game);
  const { controls } = useThree() as unknown as {
    controls: { target?: THREE.Vector3 } | null;
  };
  // start at the house centre (matches OrbitControls' initial target)
  const desired = useRef(new THREE.Vector3(0, 0, 4));

  useFrame(() => {
    if (!game) return;
    const active = game.players.find((p) => p.id === game.activePlayerId);
    const room = active?.position ? game.house[active.position] : undefined;
    if (room) {
      const [x, y, z] = roomWorld(room);
      desired.current.set(x, y + 0.6, z);
    }
    if (controls?.target) {
      controls.target.lerp(desired.current, 0.025);
    }
  });

  return null;
}
