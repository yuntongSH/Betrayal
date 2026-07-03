import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { buildExplorerFigure, animateFigure } from "@dread-hollow/decor";
import * as THREE from "three";
import type { Group } from "three";
import { AVATARS } from "./avatars";
import { Avatar } from "./Avatar";

/** Shortest-arc angle lerp so a turn never spins the long way round. */
function lerpAngle(a: number, b: number, t: number): number {
  const d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

export function PlayerToken({
  position,
  color,
  archetype,
  name,
  isActive,
  isMe,
  side,
  alive = true,
}: {
  position: [number, number, number];
  color: string;
  archetype?: string;
  name: string;
  isActive: boolean;
  isMe: boolean;
  side: "heroes" | "traitor" | null;
  alive?: boolean;
}) {
  // Prefer a real rigged model when one is mapped for this character; otherwise
  // fall back to the procedural figure (also the Suspense fallback while loading).
  const entry = archetype ? AVATARS[archetype] : undefined;
  const figure = useMemo(
    () => (entry ? null : buildExplorerFigure(color, { archetype })),
    [entry, color, archetype],
  );
  const group = useRef<Group>(null);
  // a stable per-figure phase so identical figures don't bob in lockstep
  const phase = useRef(Math.random() * 6);
  const yaw = useRef(0);
  const placed = useRef(false);
  // the world-space spot we ease toward (refreshed whenever the prop changes)
  const target = useRef(new THREE.Vector3(position[0], position[1], position[2]));
  target.current.set(position[0], position[1], position[2]);
  const prev = useRef(new THREE.Vector3());
  // Feet match the glide: `moving` flips only on transitions (with hysteresis),
  // so the rigged body strides while covering ground and idles on arrival.
  const movingRef = useRef(false);
  const [moving, setMoving] = useState(false);

  // The procedural fallback can't play a Death clip — lay it where it fell.
  useEffect(() => {
    if (figure && !alive) {
      figure.rotation.x = -Math.PI / 2;
      figure.position.y = 0.12;
    }
  }, [figure, alive]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;

    // Snap into place on the first frame; glide thereafter, so a move between
    // rooms reads as travel rather than a teleport.
    if (!placed.current) {
      g.position.copy(target.current);
      placed.current = true;
    }
    prev.current.copy(g.position);
    // Slower glide (~0.22s) so another player's / a bot's room-to-room move reads
    // as walking rather than a near-instant pop.
    g.position.lerp(target.current, 1 - Math.exp(-4.5 * dt));

    // Turn to face the direction of travel while actually moving.
    const dx = g.position.x - prev.current.x;
    const dz = g.position.z - prev.current.z;
    if (alive && dx * dx + dz * dz > 1e-6) {
      yaw.current = lerpAngle(yaw.current, Math.atan2(dx, dz), 1 - Math.exp(-12 * dt));
    }
    g.rotation.y = yaw.current;

    const speed = Math.sqrt(dx * dx + dz * dz) / Math.max(1e-4, dt);
    const isMoving = alive && speed > (movingRef.current ? 0.22 : 0.5);
    if (isMoving !== movingRef.current) {
      movingRef.current = isMoving;
      setMoving(isMoving);
    }

    // Local idle animation only for the procedural figure; the glTF avatar plays
    // its own clips via useAnimations. The dead lie exactly as they fell.
    if (figure && alive) animateFigure(figure, t, { active: isActive, phase: phase.current, baseY: 0.02 });
  });

  return (
    <group ref={group}>
      {figure && <primitive object={figure} />}
      {entry && (
        <Suspense fallback={null}>
          <Avatar entry={entry} archetype={archetype} moving={moving} dead={!alive} />
        </Suspense>
      )}

      {/* a bright pillar of light marks whoever is up */}
      {isActive && alive && (
        <>
          <pointLight position={[0, 1.6, 0]} color="#e8a85a" intensity={5} distance={4} />
          <mesh position={[0, 1.6, 0]}>
            <cylinderGeometry args={[0.05, 0.5, 3.2, 12, 1, true]} />
            <meshBasicMaterial color="#e8a85a" transparent opacity={0.12} depthWrite={false} />
          </mesh>
        </>
      )}
      {side === "traitor" && alive && (
        <pointLight position={[0, 1, 0]} color="#c2412f" intensity={4} distance={3} />
      )}

      <Html position={[0, alive ? 1.9 : 0.7, 0]} center distanceFactor={12} occlude={false}>
        <div
          className={`token-label ${isMe ? "me" : ""} ${side === "traitor" ? "traitor" : ""} ${alive ? "" : "dead"}`}
        >
          {alive ? name : `✝ ${name}`}
          {alive && side === "traitor" ? " ☠" : ""}
        </div>
      </Html>
    </group>
  );
}
