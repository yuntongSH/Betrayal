import {
  EffectComposer,
  Bloom,
  Vignette,
  Noise,
  SMAA,
  HueSaturation,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";

/**
 * The screen-space grade. The key fix vs. the old pass is the much higher Bloom
 * luminance threshold: at 0.18 every mid-tone wall bloomed and the scene went
 * milky-grey; at 0.55 only flames, emissive decals and moonlight glow — which is
 * the cinematic intent. Grain is also halved (0.22 was distractingly heavy).
 */
export function PostFX() {
  return (
    <EffectComposer multisampling={0}>
      <SMAA />
      <Bloom
        intensity={0.85}
        luminanceThreshold={0.55}
        luminanceSmoothing={0.25}
        radius={0.7}
        mipmapBlur
      />
      <HueSaturation saturation={-0.08} />
      <Vignette offset={0.3} darkness={0.85} eskil={false} />
      <Noise blendFunction={BlendFunction.OVERLAY} opacity={0.1} />
    </EffectComposer>
  );
}
