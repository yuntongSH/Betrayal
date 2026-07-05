import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette, HueSaturation } from "@react-three/postprocessing";
import type { EffectComposer as EffectComposerImpl } from "postprocessing";
import { perfCounters, renderGate } from "./governor";

/**
 * The screen-space grade, on a perf diet (players' machines were overheating):
 *
 * - Bloom (mipmap) + Vignette stay — they ARE the look. HueSaturation's small
 *   desaturation stays too: `postprocessing` merges it into the same fullscreen
 *   pass as the Vignette, so it costs one uniform, not a pass.
 * - SMAA and Noise are gone: each was a fullscreen pass at up to 1.5x DPR every
 *   frame — SMAA duplicated the canvas's own MSAA (`antialias: true`), and the
 *   0.1-opacity grain was invisible under the vignette on a dark scene.
 * - The Bloom luminance threshold history: at 0.18 every mid-tone wall bloomed
 *   and the scene went milky-grey; at 0.55 only flames, emissive decals and
 *   moonlight glow — which is the cinematic intent.
 *
 * RENDER TAKEOVER: `enabled={false}` stops the library's own frame loop and
 * our priority-1 useFrame renders instead (any positive priority disables
 * r3f's automatic render), but ONLY on ticks the PerfGovernor admits — every
 * tick while the board is active, ~24 fps while it is quiet. Skipped ticks do
 * zero GL work (scene pass, shadow maps and postFX all live inside
 * `composer.render`); the canvas simply keeps presenting the last frame.
 */
export function PostFX() {
  const composer = useRef<EffectComposerImpl>(null);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);

  // The library re-sizes its buffers only when the CSS size changes; a DPR
  // step from the governor changes just the drawing buffer, so nudge the
  // composer to re-derive its render-target sizes (it reads the renderer's
  // drawing-buffer size internally).
  useEffect(() => {
    composer.current?.setSize(size.width, size.height);
  }, [size, dpr]);

  useFrame((state, delta) => {
    const c = composer.current;
    if (!c || !renderGate.render) return;
    const gl = state.gl;
    const prevAutoClear = gl.autoClear;
    gl.autoClear = true;
    c.render(delta);
    gl.autoClear = prevAutoClear;
    perfCounters.renders++;
  }, 1);

  return (
    <EffectComposer ref={composer} enabled={false} multisampling={0}>
      <Bloom
        intensity={0.85}
        luminanceThreshold={0.55}
        luminanceSmoothing={0.25}
        radius={0.7}
        mipmapBlur
      />
      <HueSaturation saturation={-0.08} />
      <Vignette offset={0.3} darkness={0.85} eskil={false} />
    </EffectComposer>
  );
}
