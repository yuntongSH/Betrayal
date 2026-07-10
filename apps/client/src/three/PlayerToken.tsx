import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { buildExplorerFigure, animateFigure } from "@dread-hollow/decor";
import * as THREE from "three";
import type { Group } from "three";
import { AVATARS } from "./avatars";
import { Avatar } from "./Avatar";
import { followTarget, registerToken, unregisterToken, trackedTokens, MAX_FRAME_DT } from "./followCam";
import {
  followPath,
  peakSpeedFor,
  setWalking,
  sweep,
  tokenSpeeds,
  walkingTokens,
  WALK_SPEED,
  type WalkPoint,
} from "./walk";
import { avatarHandles, playOneShotFor } from "./avatarRegistry";
import { useBeats } from "../state/beats";
import { useStore } from "../state/store";
import { TRAIT_COLOR } from "../ui/icons";

/** Shortest-arc angle lerp so a turn never spins the long way round. */
function lerpAngle(a: number, b: number, t: number): number {
  const d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

/** Gaze range: a walker further than this is beneath notice. */
const GAZE_WALKER_R2 = 12 * 12;
/** A roommate to glance at sits within about a room's ring. */
const GAZE_ROOM_R2 = 5 * 5;
/** Head-turn drop for a passing figure — aim at chest height. */
const CHEST_Y = 1.2;

// Per-frame scratch — useFrame callbacks run sequentially, never re-entrant.
const GAZE_AT = new THREE.Vector3();
const GAZE_BEST = new THREE.Vector3();

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
  const cursor = useRef({ i: 0, traveled: 0 });
  // Peak speed for the current path — 0 until the first frame measures the
  // path's real length from wherever the body actually stands.
  const peak = useRef(0);
  if (activePath.current !== path) {
    activePath.current = path;
    cursor.current.i = 0;
    cursor.current.traveled = 0;
    peak.current = 0;
  }
  // Turn lean (body banks into a turn) and its slew rate, applied to an inner
  // group so it composes cleanly under the yaw the outer group carries.
  const lean = useRef<Group>(null);
  const leanZ = useRef(0);
  const prevYaw = useRef(0);
  // Roommate-glance dwell: alternate looking (3–6 s) and resting (2–4 s).
  const gaze = useRef({ until: 0, looking: false });
  // Trait changes float up off the character ("−1 Knowledge") — see beats.ts.
  const traitDeltas = useBeats((s) => s.traitDeltas);
  const myDeltas = traitDeltas.filter((d) => d.playerId === tokenId);
  const lastHitDelta = useRef<number | null>(null);
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

  // Free the walking flag and live speed when this token unmounts
  // (dies/leaves mid-stride).
  useEffect(
    () => () => {
      setWalking(tokenId, false);
      tokenSpeeds.delete(tokenId);
    },
    [tokenId],
  );

  // A fresh negative trait delta makes the body flinch (rigged avatars only,
  // and not mid-stride — a walk keeps its footing).
  useEffect(() => {
    for (let i = myDeltas.length - 1; i >= 0; i--) {
      const d = myDeltas[i]!;
      if (d.delta < 0) {
        if (lastHitDelta.current !== d.id && !movingRef.current) playOneShotFor(tokenId, "hit");
        lastHitDelta.current = d.id;
        return;
      }
    }
  });

  // The whole party reels when the house turns; the survivors' side celebrates
  // when the night is won. Staggered so they don't move as one machine.
  const gamePhase = useStore((s) => s.game?.phase);
  const winner = useStore((s) => s.game?.winner ?? null);
  const prevPhase = useRef(gamePhase);
  useEffect(() => {
    if (gamePhase !== prevPhase.current) {
      if (gamePhase === "haunt" && alive) playOneShotFor(tokenId, "stagger", Math.random() * 450);
      if (gamePhase === "ended" && alive && side && side === winner) {
        playOneShotFor(tokenId, "cheer", Math.random() * 600);
      }
      prevPhase.current = gamePhase;
    }
  }, [gamePhase, winner, alive, side, tokenId]);

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
    // Size up a fresh path from where the body actually stands: long hauls
    // (room to room) jog, short in-room shuffles keep the unhurried walk.
    const p = alive ? activePath.current : null;
    let gate = 1;
    if (p && cursor.current.i < p.length) {
      if (peak.current === 0) {
        let len = 0;
        let px = g.position.x, py = g.position.y, pz = g.position.z;
        for (let k = cursor.current.i; k < p.length; k++) {
          const w = p[k]!;
          len += Math.hypot(w[0] - px, w[1] - py, w[2] - pz);
          px = w[0]; py = w[1]; pz = w[2];
        }
        peak.current = peakSpeedFor(len);
      }
      // Facing gate: while the body still points away from the next waypoint
      // it barely covers ground — the yaw ease below brings it around first,
      // so setting off reads as turn-then-go instead of a sideways moonwalk.
      const wp = p[cursor.current.i]!;
      const err = Math.abs(sweep(yaw.current, Math.atan2(wp[0] - g.position.x, wp[2] - g.position.z)));
      gate = Math.max(0.12, Math.min(1, 1.3 - (err / Math.PI) * 2));
    }
    // Waypoint walking around the furniture when a path is set; otherwise the
    // exponential glide (floor changes, elevator jumps, clear straight lines).
    const walking = p
      ? followPath(g.position, p, cursor.current, dt, peak.current || WALK_SPEED, gate)
      : false;
    if (!walking) g.position.lerp(target.current, 1 - Math.exp(-2.6 * dt));

    // Turn to face the direction of travel while actually moving.
    const dx = g.position.x - prev.current.x;
    const dz = g.position.z - prev.current.z;
    if (alive && dx * dx + dz * dz > 1e-6) {
      yaw.current = lerpAngle(yaw.current, Math.atan2(dx, dz), 1 - Math.exp(-12 * dt));
    }
    g.rotation.y = yaw.current;

    // Following a path IS walking; otherwise fall back to measured speed so a
    // plain glide still strides. Hysteresis keeps the clip from flapping.
    const speed = Math.sqrt(dx * dx + dz * dz) / Math.max(1e-4, dt);
    // Publish live ground speed for the avatar's locomotion blend.
    tokenSpeeds.set(tokenId, alive ? speed : 0);
    const isMoving = alive && (walking || speed > (movingRef.current ? 0.4 : 0.8));
    if (isMoving !== movingRef.current) {
      movingRef.current = isMoving;
      setMoving(isMoving);
      setWalking(tokenId, isMoving); // gaze pass reads this to spot passers-by
    }

    // Body banks into a turn: lean into the yaw rate, ease back to upright when
    // straight or stopped. Applied to the inner group so yaw stays clean.
    const yawRate = lerpAngle(0, yaw.current - prevYaw.current, 1) / Math.max(1e-4, dt);
    prevYaw.current = yaw.current;
    const targetLean = movingRef.current
      ? THREE.MathUtils.clamp(-yawRate * 0.12, -0.09, 0.09)
      : 0;
    leanZ.current += (targetLean - leanZ.current) * (1 - Math.exp(-8 * dt));
    if (lean.current) lean.current.rotation.z = leanZ.current;

    // Gaze: a rigged avatar turns its head toward the most interesting thing —
    // a figure walking past wins, else a roommate to glance at, else it drifts.
    const life = alive ? avatarHandles.get(tokenId)?.life : undefined;
    if (life) {
      if (movingRef.current) {
        life.setGaze(null); // eyes lead the walk on their own
      } else {
        let bestD2 = Infinity;
        let found = false;
        // priority a — the nearest OTHER token that is walking, within range.
        for (const [id, tok] of trackedTokens) {
          if (id === tokenId || !walkingTokens.has(id)) continue;
          const d2 = g.position.distanceToSquared(tok.obj.position);
          if (d2 < GAZE_WALKER_R2 && d2 < bestD2) {
            bestD2 = d2;
            GAZE_BEST.copy(tok.obj.position).setY(tok.obj.position.y + tok.chestY);
            found = true;
          }
        }
        // priority b — else glance at a roommate during the "looking" window.
        if (!found) {
          if (t > gaze.current.until) {
            gaze.current.looking = !gaze.current.looking;
            gaze.current.until = t + (gaze.current.looking ? 3 + Math.random() * 3 : 2 + Math.random() * 2);
          }
          if (gaze.current.looking) {
            for (const [id, tok] of trackedTokens) {
              if (id === tokenId || walkingTokens.has(id)) continue;
              const d2 = g.position.distanceToSquared(tok.obj.position);
              if (d2 < GAZE_ROOM_R2 && d2 < bestD2) {
                bestD2 = d2;
                GAZE_BEST.copy(tok.obj.position).setY(tok.obj.position.y + CHEST_Y);
                found = true;
              }
            }
          }
        }
        life.setGaze(found ? GAZE_AT.copy(GAZE_BEST) : null);
      }
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
      {/* inner group carries the turn-lean so the outer group's yaw stays clean */}
      <group ref={lean}>
        {figure && <primitive object={figure} />}
        {entry && (
          <Suspense fallback={null}>
            <Avatar entry={entry} archetype={archetype} moving={moving} dead={!alive} tokenId={tokenId} />
          </Suspense>
        )}
      </group>


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
