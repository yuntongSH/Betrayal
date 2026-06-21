import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/** Slow-drifting dust motes caught in the moonlight. */
function Dust({ count = 450 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 44;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 26;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 44 + 4;
    }
    return arr;
  }, [count]);

  useFrame((_, dt) => {
    const pts = ref.current;
    if (!pts) return;
    const attr = pts.geometry.getAttribute("position") as THREE.BufferAttribute;
    const a = attr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      a[i * 3 + 1] += dt * 0.22;
      if (a[i * 3 + 1] > 14) a[i * 3 + 1] = -12;
    }
    attr.needsUpdate = true;
    pts.rotation.y += dt * 0.008;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        color="#c9b59a"
        transparent
        opacity={0.32}
        sizeAttenuation
        depthWrite={false}
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
    const t = state.clock.elapsedTime;
    l.intensity = 3.2 + Math.sin(t * 9 + base[0]) * 1.1 + Math.random() * 0.7;
    l.position.x = base[0] + Math.sin(t * 0.5 + base[2]) * 1.4;
    l.position.z = base[2] + Math.cos(t * 0.4 + base[0]) * 1.4;
    l.position.y = base[1] + Math.sin(t * 0.7) * 0.5;
  });
  return (
    <pointLight
      ref={ref}
      color="#e8975a"
      distance={10}
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
      <Wisp base={[-2, 1.2, 6]} />
      <Wisp base={[3, 1.6, 3]} />
    </group>
  );
}
