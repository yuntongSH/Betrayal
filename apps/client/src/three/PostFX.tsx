import { EffectComposer, Bloom, Vignette, Noise } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";

/**
 * The screen-space mood: a soft bloom so candle-glow bleeds into the dark, a
 * heavy vignette to crush the edges, and a film of grain over everything.
 */
export function PostFX() {
  return (
    <EffectComposer multisampling={2}>
      <Bloom
        intensity={0.8}
        luminanceThreshold={0.18}
        luminanceSmoothing={0.4}
        mipmapBlur
      />
      <Vignette offset={0.22} darkness={0.88} eskil={false} />
      <Noise blendFunction={BlendFunction.OVERLAY} opacity={0.22} />
    </EffectComposer>
  );
}
