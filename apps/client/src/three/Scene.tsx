import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { HouseView } from "./HouseView";
import { Atmosphere } from "./Atmosphere";
import { CameraDirector } from "./CameraDirector";
import { KeyboardMover } from "./KeyboardMover";
import { PostFX } from "./PostFX";
import { FLOOR_GAP } from "./layout";

export function Scene() {
  return (
    <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={["#040407"]} />
      {/* fog pulled in tight so rooms far from any explorer dissolve into dread */}
      <fog attach="fog" args={["#05050a", 9, 34]} />

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

      {/* near-black base: the house is lit almost entirely by the candle pools
          that follow the living explorers (fog-of-war in RoomTile), so rooms no
          one is near sink into shadow. One cold moonlight key casts the shadows. */}
      <ambientLight intensity={0.05} color="#1a2742" />
      <hemisphereLight args={["#1a2238", "#060503", 0.1]} />
      <directionalLight
        position={[14, 28, 6]}
        intensity={0.2}
        color="#8fa2cc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      {/* faint cold rim so silhouettes read against the void */}
      <directionalLight position={[-12, 6, -10]} intensity={0.08} color="#3a4d78" />

      <Suspense fallback={null}>
        <HouseView />
      </Suspense>

      <Atmosphere />
      <CameraDirector />
      <KeyboardMover />

      {/* the void the house floats in */}
      <mesh position={[0, -FLOOR_GAP - 2, 4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#050507" roughness={1} />
      </mesh>

      <PostFX />
    </Canvas>
  );
}
