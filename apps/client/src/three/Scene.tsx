import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { HouseView } from "./HouseView";
import { Atmosphere } from "./Atmosphere";
import { CameraDirector } from "./CameraDirector";
import { HauntCinematic } from "./HauntCinematic";
import { XrayWalls } from "./XrayWalls";
import { BeatFX } from "./BeatFX";
import { KeyboardMover } from "./KeyboardMover";
import { PostFX } from "./PostFX";
import { PerfGovernor, INITIAL_DPR } from "./governor";
import { FLOOR_GAP } from "./layout";

export function Scene() {
  return (
    /* dpr capped at 1.5 — retina 2x doubled the GPU bill for no readable gain;
       from here the PerfGovernor walks it down/up with measured frame times. */
    <Canvas shadows dpr={INITIAL_DPR} gl={{ antialias: true }}>
      <color attach="background" args={["#040407"]} />
      {/* fog pulled in tight so rooms far from any explorer dissolve into dread */}
      <fog attach="fog" args={["#05050a", 16, 60]} />

      <PerspectiveCamera makeDefault position={[21, 24, 32]} fov={48} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        target={[0, 0, 7]}
        maxPolarAngle={1.45}
        minDistance={5}
        maxDistance={100}
      />

      {/* near-black base: the house is lit almost entirely by the candle pools
          that follow the living explorers (fog-of-war in RoomTile), so rooms no
          one is near sink into shadow. One cold moonlight key casts the shadows. */}
      <ambientLight intensity={0.08} color="#1a2742" />
      <hemisphereLight args={["#1a2238", "#060503", 0.13]} />
      <directionalLight
        position={[24.5, 49, 10.5]}
        intensity={0.24}
        color="#8fa2cc"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
        shadow-camera-near={1}
        shadow-camera-far={190}
      />
      {/* faint cold rim so silhouettes read against the void */}
      <directionalLight position={[-12, 6, -10]} intensity={0.08} color="#3a4d78" />

      <Suspense fallback={null}>
        <HouseView />
      </Suspense>

      <Atmosphere />
      <CameraDirector />
      <HauntCinematic />
      <XrayWalls />
      <BeatFX />
      <KeyboardMover />
      <PerfGovernor />

      {/* the void the house floats in */}
      <mesh position={[0, -FLOOR_GAP - 2, 7]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#050507" roughness={1} />
      </mesh>

      <PostFX />
    </Canvas>
  );
}
