import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { buildExplorerFigure, animateFigure } from "@dread-hollow/decor";
import * as THREE from "three";
import type { Group } from "three";
import { AVATARS } from "./avatars";
import { Avatar } from "./Avatar";
import { followTarget, registerToken, unregisterToken, MAX_FRAME_DT } from "./followCam";
import { followPath, type WalkPoint } from "./walk";
import { useBeats } from "../state/beats";
import { TRAIT_COLOR } from "../ui/icons";

/** Shortest-arc angle lerp so a turn never spins the long way round. */
function lerpAngle(a: number, b: number, t: number): number {
  const d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

export function PlayerToken({
  tokenId,
  position,
  path,
  color,
  archetype,
  name,
  isActive,
  isMe,
  side,
  alive = true,
}: {
  tokenId: string;
  position: [number, number, number];
  /** Waypoints to walk through toward `position` (null = plain glide). */
  path?: readonly WalkPoint[] | null;
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
  // A fresh path prop restarts waypoint walking from wherever the body stands.
  const activePath = useRef<readonly WalkPoint[] | null | undefined>(undefined);
  const cursor = useRef({ i: 0 });
  if (activePath.current !== path) {
    activePath.current = path;
    cursor.current.i = 0;
  }
  // Trait changes float up off the character ("−1 Knowledge") — see beats.ts.
  const traitDeltas = useBeats((s) => s.traitDeltas);
  const myDeltas = traitDeltas.filter((d) => d.playerId === tokenId);
  // Feet match the glide: `moving` flips only on transitions (with hysteresis),
  // so the rigged body strides while covering ground and idles on arrival.
  const movingRef = useRef(false);
  const [moving, setMoving] = useState(false);
  // Movement readability: the walker's candle pool brightens while striding.
  const glow = useRef(0);
  const activeLight = useRef<THREE.PointLight>(null);

  // The procedural fallback can't play a Death clip — lay it where it fell.
  useEffect(() => {
    if (figure && !alive) {
      figure.rotation.x = -Math.PI / 2;
      figure.position.y = 0.12;
    }
  }, [figure, alive]);

  // The x-ray raycast tracks living explorers' lerped positions via this registry.
  useEffect(() => {
    if (!alive || !group.current) return;
    registerToken(tokenId, group.current, 1.2);
    return () => unregisterToken(tokenId);
  }, [tokenId, alive]);

  useFrame((state, rawDt) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    // Cap hitches (tab-switch, GC) without dropping to slow-motion at low FPS.
    const dt = Math.min(MAX_FRAME_DT, rawDt);

    // Snap into place on the first frame (never walk in from a stale path);
    // travel thereafter, so a move between rooms reads as walking.
    if (!placed.current) {
      g.position.copy(target.current);
      if (activePath.current) cursor.current.i = activePath.current.length;
      placed.current = true;
    }
    // A modal beat owns the stage — hold this walker exactly where it stands
    // (dt-based systems resume seamlessly when the card dismisses).
    if (useBeats.getState().worldFrozen) return;
    prev.current.copy(g.position);
    // Waypoint walking around the furniture when a path is set; otherwise the
    // exponential glide (floor changes, elevator jumps, clear straight lines).
    const walking = alive && activePath.current
      ? followPath(g.position, activePath.current, cursor.current, dt)
      : false;
    if (!walking) g.position.lerp(target.current, 1 - Math.exp(-2.6 * dt));

    // Turn to face the direction of travel while actually moving.
    const dx = g.position.x - prev.current.x;
    const dz = g.position.z - prev.current.z;
    if (alive && dx * dx + dz * dz > 1e-6) {
      yaw.current = lerpAngle(yaw.current, Math.atan2(dx, dz), 1 - Math.exp(-12 * dt));
    }
    g.rotation.y = yaw.current;

    const speed = Math.sqrt(dx * dx + dz * dz) / Math.max(1e-4, dt);
    const isMoving = alive && speed > (movingRef.current ? 0.4 : 0.8);
    if (isMoving !== movingRef.current) {
      movingRef.current = isMoving;
      setMoving(isMoving);
    }

    // Feed the follow camera: whoever is up broadcasts their live position,
    // heading, and stride state (exactly the walk-clip hysteresis above).
    if (isActive && alive) {
      followTarget.pos.copy(g.position);
      followTarget.yaw = yaw.current;
      followTarget.moving = movingRef.current;
      followTarget.valid = true;
    }

    // Brighten the walker's pool while covering ground (readability at TILE 7).
    glow.current += ((movingRef.current ? 1 : 0) - glow.current) * (1 - Math.exp(-6 * dt));
    if (activeLight.current) activeLight.current.intensity = 5 + 4 * glow.current;

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
          <pointLight ref={activeLight} position={[0, 1.6, 0]} color="#e8a85a" intensity={5} distance={6} />
          <mesh position={[0, 1.9, 0]}>
            <cylinderGeometry args={[0.05, 0.55, 3.8, 12, 1, true]} />
            <meshBasicMaterial color="#e8a85a" transparent opacity={0.12} depthWrite={false} />
          </mesh>
        </>
      )}
      {side === "traitor" && alive && (
        <pointLight position={[0, 1, 0]} color="#c2412f" intensity={4} distance={4} />
      )}

      <Html position={[0, alive ? 1.9 : 0.7, 0]} center distanceFactor={21} occlude={false}>
        <div
          className={`token-label ${isMe ? "me" : ""} ${side === "traitor" ? "traitor" : ""} ${alive ? "" : "dead"}`}
        >
          {alive ? name : `✝ ${name}`}
          {alive && side === "traitor" ? " ☠" : ""}
        </div>
      </Html>

      {/* transient trait-change floats — each rises and fades, then beats.ts
          expires the delta and the node unmounts */}
      {myDeltas.map((d, i) => (
        <Html key={d.id} position={[0, 2.5 + i * 0.35, 0]} center distanceFactor={21} occlude={false}>
          <div className="stat-float" style={{ color: TRAIT_COLOR[d.trait] }}>
            {d.delta > 0 ? `+${d.delta}` : `−${-d.delta}`}{" "}
            {d.trait.charAt(0).toUpperCase() + d.trait.slice(1)}
          </div>
        </Html>
      ))}
    </group>
  );
}
