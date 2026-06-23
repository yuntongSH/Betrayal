import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { HouseView } from "./HouseView";
import { Atmosphere } from "./Atmosphere";
import { PostFX } from "./PostFX";
import { FLOOR_GAP } from "./layout";

export function Scene() {
  return (
    <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={["#06060a"]} />
      {/* fog pulled in so unexplored rooms dissolve into dread */}
      <fog attach="fog" args={["#070710", 11, 42]} />

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

      {/* all darkness is blue, all light is amber: crushed cold ambient + one
          cold moonlight key (the only shadow caster); warm practicals do the rest */}
      <ambientLight intensity={0.08} color="#2a3a5e" />
      <hemisphereLight args={["#26324f", "#080604", 0.18]} />
      <directionalLight
        position={[14, 28, 6]}
        intensity={0.65}
        color="#aebfe8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      {/* faint cold rim so silhouettes read against the void */}
      <directionalLight position={[-12, 6, -10]} intensity={0.12} color="#3a4d78" />

      <Suspense fallback={null}>
        <HouseView />
      </Suspense>

      <Atmosphere />

      {/* the void the house floats in */}
      <mesh position={[0, -FLOOR_GAP - 2, 4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#050507" roughness={1} />
      </mesh>

      <PostFX />
    </Canvas>
  );
}
