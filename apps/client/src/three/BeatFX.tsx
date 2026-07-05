import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../state/store";
import { pendingFx as beatQueue, useBeats } from "../state/beats";
import { TILE, roomWorld } from "./layout";
import { MAX_FRAME_DT } from "./followCam";
import { markActive } from "./governor";
import { FX_COLORS, pendingFx, type FxRequest } from "./director";

const S = TILE / 4; // world-scale factor for distances tuned at the old 4-unit tile
const EMBERS = 90;
const PULSE_LIFE = 1.3; // s
const BURST_LIFE = 1.7; // s (opacity reaches 0 at 1.6)

interface Pulse {
  light: THREE.PointLight;
  t: number;
}

interface Burst {
  points: THREE.Points;
  mat: THREE.PointsMaterial;
  vel: Float32Array;
  life: Float32Array;
  t: number;
}

/**
 * In-room 3D accompaniment for beat reveals: a sharp light pulse at the room's
 * heart plus a rising ember burst (skipped for discoveries — a new room is its
 * own spectacle). Requests arrive via the module-level `pendingFx` queue pushed
 * by the beat layer; this component owns the live lights/points and disposes
 * them when spent.
 */
export function BeatFX() {
  const pulses = useRef<Pulse[]>([]);
  const bursts = useRef<Burst[]>([]);

  // If the scene unmounts mid-effect, drop everything we own.
  useEffect(
    () => () => {
      for (const p of pulses.current) {
        p.light.parent?.remove(p.light);
        p.light.dispose();
      }
      for (const b of bursts.current) {
        b.points.parent?.remove(b.points);
        b.points.geometry.dispose();
        b.mat.dispose();
      }
      pulses.current = [];
      bursts.current = [];
    },
    [],
  );

  useFrame(({ scene }, rawDt) => {
    // Modal beat up: particles and light pulses hold (and new requests wait in
    // their queues), so the room's flourish plays as the world resumes.
    if (useBeats.getState().worldFrozen) return;
    const dt = Math.min(MAX_FRAME_DT, rawDt);

    // Live particles/pulses (or queued requests) must render at full rate —
    // the governor can't see them (lights and points aren't tracked tokens).
    if (
      pulses.current.length > 0 ||
      bursts.current.length > 0 ||
      pendingFx.length > 0 ||
      beatQueue.length > 0
    ) {
      markActive(100);
    }

    // Drain new requests from the beat layer AND the director's own queue
    // (read the house from the store — read-only).
    while (pendingFx.length > 0 || beatQueue.length > 0) {
      const req: FxRequest = (pendingFx.shift() ?? beatQueue.shift())!;
      const game = useStore.getState().game;
      const room = game?.house[req.roomKey];
      if (!room) continue;
      const [wx, wy, wz] = roomWorld(room);
      const color = FX_COLORS[req.type] ?? 0xe2a85a;

      const light = new THREE.PointLight(color, 0, TILE * 2.4, 2);
      light.position.set(wx, wy + 1.7, wz);
      scene.add(light);
      pulses.current.push({ light, t: 0 });

      if (req.type !== "discovery") {
        const pos = new Float32Array(EMBERS * 3);
        const vel = new Float32Array(EMBERS * 3);
        const life = new Float32Array(EMBERS);
        for (let i = 0; i < EMBERS; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * 0.5 * S;
          pos[i * 3] = Math.cos(a) * r;
          pos[i * 3 + 1] = 0;
          pos[i * 3 + 2] = Math.sin(a) * r;
          const ha = Math.random() * Math.PI * 2;
          const hs = (0.15 + Math.random() * 0.55) * S;
          vel[i * 3] = Math.cos(ha) * hs;
          vel[i * 3 + 1] = (1.0 + Math.random() * 1.2) * S;
          vel[i * 3 + 2] = Math.sin(ha) * hs;
          life[i] = 1.3 + Math.random() * 0.4;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({
          size: 0.07 * S,
          color,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
        });
        const points = new THREE.Points(geo, mat);
        points.position.set(wx, wy + 0.25 * S, wz);
        scene.add(points);
        bursts.current.push({ points, mat, vel, life, t: 0 });
      }
    }

    // Light pulses: linear attack over 120 ms, then an exponential fall.
    for (let i = pulses.current.length - 1; i >= 0; i--) {
      const p = pulses.current[i]!;
      p.t += dt;
      if (p.t >= PULSE_LIFE) {
        p.light.parent?.remove(p.light);
        p.light.dispose();
        pulses.current.splice(i, 1);
        continue;
      }
      p.light.intensity = p.t < 0.12 ? 26 * (p.t / 0.12) : 26 * Math.exp(-4 * (p.t - 0.12));
    }

    // Ember bursts: rise, drift, fall under gravity, fade as a body.
    for (let i = bursts.current.length - 1; i >= 0; i--) {
      const b = bursts.current[i]!;
      b.t += dt;
      if (b.t >= BURST_LIFE) {
        b.points.parent?.remove(b.points);
        b.points.geometry.dispose();
        b.mat.dispose();
        bursts.current.splice(i, 1);
        continue;
      }
      const attr = b.points.geometry.getAttribute("position") as THREE.BufferAttribute;
      const a = attr.array as Float32Array;
      for (let j = 0; j < EMBERS; j++) {
        if (b.t > b.life[j]!) continue; // spent embers freeze and fade with the rest
        b.vel[j * 3 + 1] -= 0.6 * S * dt;
        a[j * 3] += b.vel[j * 3]! * dt;
        a[j * 3 + 1] += b.vel[j * 3 + 1]! * dt;
        a[j * 3 + 2] += b.vel[j * 3 + 2]! * dt;
      }
      attr.needsUpdate = true;
      b.mat.opacity = Math.max(0, 0.9 * (1 - b.t / 1.6));
    }
  });

  return null;
}
