import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { HouseView } from "./HouseView";
import { FLOOR_GAP } from "./layout";

export function Scene() {
  return (
    <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={["#06060a"]} />
      <fog attach="fog" args={["#06060a", 14, 46]} />

      <PerspectiveCamera makeDefault position={[12, 14, 18]} fov={48} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        target={[0, 0, 4]}
        maxPolarAngle={1.45}
        minDistance={6}
        maxDistance={60}
      />

      {/* cold moonlight from above, a barely-there ambient fill */}
      <ambientLight intensity={0.12} color="#39507a" />
      <hemisphereLight args={["#2a3550", "#0a0806", 0.25]} />
      <directionalLight
        position={[10, 24, 8]}
        intensity={0.5}
        color="#9fb4e0"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />

      <Suspense fallback={null}>
        <HouseView />
      </Suspense>

      {/* the void the house floats in */}
      <mesh position={[0, -FLOOR_GAP - 2, 4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#050507" roughness={1} />
      </mesh>
    </Canvas>
  );
}
