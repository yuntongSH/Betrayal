import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useBeats } from "../state/beats";

/** Slow-drifting dust motes caught in the moonlight. */
function Dust({ count = 500 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 77;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 40;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 77 + 7;
    }
    return arr;
  }, [count]);

  useFrame((state, dt) => {
    const pts = ref.current;
    if (!pts) return;
    if (useBeats.getState().worldFrozen) return; // motes hang in the frozen air
    const t = state.clock.elapsedTime;
    const attr = pts.geometry.getAttribute("position") as THREE.BufferAttribute;
    const a = attr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      a[i * 3 + 1] += dt * 0.12; // slow, calm rise
      a[i * 3] += Math.sin(t * 0.3 + i) * 0.0008; // faint lateral sway
      if (a[i * 3 + 1] > 20) a[i * 3 + 1] = -18;
    }
    attr.needsUpdate = true;
    pts.rotation.y += dt * 0.006;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.045}
        color="#b8a888"
        transparent
        opacity={0.22}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        fog={false}
      />
    </points>
  );
}

/** A restless candle-flame that wanders and flickers. */
function Wisp({ base }: { base: [number, number, number] }) {
  const ref = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    const l = ref.current;
    if (!l) return;
    if (useBeats.getState().worldFrozen) return; // the flames hold their breath
    const t = state.clock.elapsedTime;
    const seed = base[0] + base[2];
    // layered flame flicker: shimmer + body sway + drift, with rare draft dropouts
    let f =
      1 +
      Math.sin(t * 23 + seed) * 0.1 +
      Math.sin(t * 7.3 + seed * 2.1) * 0.16 +
      Math.sin(t * 1.7 + seed * 0.7) * 0.06;
    if (Math.random() < 0.015) f *= 0.55;
    l.intensity = Math.max(1.4, 3.2 * f);
    l.position.x = base[0] + Math.sin(t * 0.5 + base[2]) * 1.75;
    l.position.z = base[2] + Math.cos(t * 0.4 + base[0]) * 1.75;
    l.position.y = base[1] + Math.sin(t * 0.7) * 0.4;
  });
  return (
    <pointLight
      ref={ref}
      color="#e8975a"
      distance={17}
      decay={2}
      position={base}
    />
  );
}

export function Atmosphere() {
  return (
    <group>
      <Dust />
      <Wisp base={[0, 1.4, 0]} />
      <Wisp base={[-3.5, 1.2, 10.5]} />
      <Wisp base={[5.25, 1.6, 5.25]} />
    </group>
  );
}
