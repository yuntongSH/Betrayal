import * as THREE from "three";
import { explorerKit, makeArm, addFace, addHair, tagFigure } from "../index";

/**
 * Silas Crow, 38 — "the carnival strongman" (identity colour #b5563a).
 *
 * The tallest, heaviest explorer: a broad barrel chest, a thick neck and BARE
 * muscular arms (rendered in `skin`, the warm flesh material), wearing a
 * sleeveless striped singlet tinted by the identity colour. Bald head with a
 * strong jaw, heavy brows and a big curled handlebar moustache built from
 * primitives. A small dark-metal dumbbell is gripped in his right fist.
 *
 * Origin at the feet (y = 0), ~1.5 units tall. Tagged for the shared animator
 * with kind "explorer" and parts { head, torso, leftArm, rightArm }.
 *
 * Node-safe: builds entirely from three.js primitives (no DOM / textures).
 */
export function buildCrowFigure(colorHex: string): THREE.Group {
  const g = new THREE.Group();
  g.name = "figure:explorer:crow";
  const { bodyMat, limbMat, skin, cloth, metal } = explorerKit(colorHex, g);

  // Warm, slightly tougher flesh for the bare, heavily-muscled limbs. Built
  // from the kit's `skin` colour so it still reads the identity tint.
  const muscleSkin = new THREE.MeshStandardMaterial({
    color: (skin as THREE.MeshStandardMaterial).color.clone().multiplyScalar(0.97),
    roughness: 0.55,
  });
  // Singlet fabric (pale, identity-tinted) plus a darker stripe material so the
  // leotard reads as "striped".
  const singlet = cloth(0.32);
  const stripe = cloth(0.05, 0.35);
  // Dark, slightly glinting metal for the dumbbell.
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x26262a, roughness: 0.4, metalness: 0.75 });

  // --- heavy legs (he stands the tallest) ---------------------------------
  const legH = 0.6;
  for (const sx of [-1, 1]) {
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, legH * 0.55, 12), singlet);
    thigh.position.set(sx * 0.16, 0.05 + legH * 0.72, 0);
    g.add(thigh);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, legH * 0.5, 12), muscleSkin);
    shin.position.set(sx * 0.16, 0.05 + legH * 0.25, 0);
    g.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.1, 0.28), limbMat);
    foot.position.set(sx * 0.16, 0.1, 0.06);
    g.add(foot);
  }

  // --- barrel-chested torso ------------------------------------------------
  const torsoH = 0.56;
  const torsoY = 0.05 + legH + torsoH / 2;
  // Wide barrel chest: a tapered cylinder pushed wide on x and a touch on z.
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.21, torsoH, 16), singlet);
  torso.scale.set(1.3, 1.0, 1.0);
  torso.position.y = torsoY;
  g.add(torso);
  // Pec/upper-chest swell to exaggerate the barrel silhouette.
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), singlet);
  chest.scale.set(1.3, 0.7, 0.9);
  chest.position.y = torsoY + torsoH * 0.28;
  g.add(chest);
  // Belly swell tucking into the singlet at the waist.
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), singlet);
  belly.scale.set(1.3, 0.85, 1.0);
  belly.position.y = torsoY - torsoH * 0.3;
  g.add(belly);

  // Singlet vertical stripes wrapping the front of the chest.
  for (const dx of [-0.16, 0, 0.16]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, torsoH * 0.95, 0.04), stripe);
    s.position.set(dx, torsoY, 0.27);
    g.add(s);
  }
  // Singlet shoulder straps (front + back) so it reads as a leotard, not a shirt.
  for (const sx of [-1, 1]) {
    for (const dz of [0.2, -0.18]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, torsoH * 0.7, 0.04), singlet);
      strap.position.set(sx * 0.13, torsoY + torsoH * 0.18, dz);
      g.add(strap);
    }
  }

  // Broad bare shoulders / traps (flesh) capping the torso.
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), muscleSkin);
  shoulders.scale.set(1.45, 0.55, 0.95);
  shoulders.position.y = torsoY + torsoH / 2 - 0.01;
  g.add(shoulders);

  // --- thick BARE muscular arms (flesh) -----------------------------------
  // makeArm gives us a shoulder-pivot group the animator can swing; we thicken
  // it with a deltoid + biceps + forearm built in flesh.
  const armH = 0.5;
  const shoulderX = 0.36;
  const shoulderY = torsoY + 0.12;
  const leftArm = makeArm(-1, shoulderX, shoulderY, armH, muscleSkin, muscleSkin, 0.3);
  const rightArm = makeArm(1, shoulderX, shoulderY, armH, muscleSkin, muscleSkin, 0.3);
  for (const [sx, arm] of [[-1, leftArm], [1, rightArm]] as const) {
    // Replace the thin default upper-arm mesh with bulky muscle. The default
    // cylinder + hand sphere added by makeArm stay as the forearm/fist core;
    // we add bulk over them.
    const delt = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), muscleSkin);
    delt.scale.set(1, 1.1, 1);
    delt.position.y = -0.08;
    arm.add(delt);
    const biceps = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), muscleSkin);
    biceps.scale.set(1, 1.5, 1);
    biceps.position.y = -armH * 0.42;
    arm.add(biceps);
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.105, armH * 0.5, 12), muscleSkin);
    forearm.position.y = -armH * 0.78;
    arm.add(forearm);
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), muscleSkin);
    fist.position.set(sx * 0.04, -armH + 0.01, 0);
    arm.add(fist);
  }
  g.add(leftArm, rightArm);

  // --- dumbbell gripped in the right fist ----------------------------------
  // A short bar with a heavy weight at each end (dark metal). Held across the
  // fist (bar along x), so it swings with the arm.
  const gripY = -armH + 0.01;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 10), ironMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = gripY;
  rightArm.add(bar);
  for (const dx of [-0.13, 0.13]) {
    // Plate-style weights: a squat cylinder either side, capped with a knob.
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 14), ironMat);
    plate.rotation.z = Math.PI / 2;
    plate.position.set(dx, gripY, 0);
    rightArm.add(plate);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), ironMat);
    knob.position.set(dx + Math.sign(dx) * 0.04, gripY, 0);
    rightArm.add(knob);
  }

  // --- thick neck + bald head ---------------------------------------------
  const headR = 0.16;
  const headY = torsoY + torsoH / 2 + 0.24;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.12, 12), muscleSkin);
  neck.position.y = headY - 0.17;
  g.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 18, 16), muscleSkin);
  // Strong, slightly squared jaw: stretch the head a touch vertically and bulk
  // the lower face with a jaw block.
  head.scale.set(1.02, 1.06, 1.0);
  head.position.y = headY;
  g.add(head);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(headR * 1.55, headR * 0.7, headR * 1.3), muscleSkin);
  jaw.position.set(0, -headR * 0.55, headR * 0.1);
  head.add(jaw);

  // Procedural face: warm skin, heavy dark brows, confident expression.
  addFace(head, {
    r: headR,
    skin: muscleSkin,
    eye: 0x4a3526,
    brow: 0x241712,
    lip: 0x8a4a44,
    mood: 0.3,
    open: 0.85,
  });
  // Bald (no hair pieces) — explicit per the character brief.
  addHair(head, "bald", 0x241712, headR);

  // --- big curled HANDLEBAR moustache (primitives) -------------------------
  // Built on the head so it rides with face turns. Two tapered cylinders flare
  // out from under the nose, each ending in a thin torus that curls UP.
  const stacheMat = new THREE.MeshStandardMaterial({ color: 0x241712, roughness: 0.85 });
  const z = headR * 0.92; // sit just proud of the face front (matches addFace)
  const noseY = -headR * 0.18; // just below the nose
  for (const sx of [-1, 1]) {
    // Tapered shaft sweeping outward and slightly down from the philtrum.
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, headR * 0.95, 8), stacheMat);
    shaft.position.set(sx * headR * 0.34, noseY - headR * 0.04, z);
    shaft.rotation.z = sx * Math.PI * 0.5; // lay it horizontal
    shaft.rotation.x = -0.25; // hug the face curvature
    head.add(shaft);
    // The signature curl: a half-torus at the tip rolling upward.
    const curl = new THREE.Mesh(
      new THREE.TorusGeometry(headR * 0.16, 0.014, 8, 14, Math.PI * 1.25),
      stacheMat,
    );
    curl.position.set(sx * headR * 0.72, noseY + headR * 0.02, z - headR * 0.04);
    curl.rotation.y = sx * Math.PI * 0.5;
    curl.rotation.z = sx * Math.PI * 0.4;
    head.add(curl);
  }

  // Identity-tinted strongman waist sash/belt so the player colour reads clearly.
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.08, 18), bodyMat);
  belt.scale.set(1.3, 1.0, 1.0);
  belt.position.y = torsoY - torsoH * 0.42;
  g.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.03), metal);
  buckle.position.set(0, torsoY - torsoH * 0.42, 0.3);
  g.add(buckle);

  tagFigure(g, "explorer", { head, torso, leftArm, rightArm }, "crow:" + colorHex);
  return g;
}
