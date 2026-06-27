import * as THREE from "three";
import { explorerKit, makeArm, addFace, addHair, tagFigure } from "../index";

/**
 * Odette Lindqvist, 33 — "the séance medium" (identity colour #c25a8f).
 *
 * Elegant and uncanny. A long flowing dress falls to the floor (a skirt cone
 * tinted by her identity colour), cinched at the waist beneath a slim bodice.
 * A draped shawl pools over the shoulders and trails down her back; loose
 * draped sleeves hang from the arms. Long dark wavy hair spills out from
 * beneath a translucent veil that drifts over her crown and down behind her.
 * Pale skin, kohl-rimmed eyes (dark brows, a deep plum-grey iris) set serene
 * and level. A glowing crystal pendant hangs at her chest on a thin cord, lit
 * from within in her identity tint; tiny matching earrings catch the light.
 *
 * Origin at the feet (y = 0); roughly 1.5 units tall. The returned group is
 * tagged for the shared animator via {@link tagFigure}. THREE-only / node-safe.
 */
export function buildOdetteFigure(colorHex: string): THREE.Group {
  const g = new THREE.Group();
  g.name = "figure:explorer:odette";

  // Shared palette + glowing identity base disc.
  const { tint, skin, cloth } = explorerKit(colorHex, g);
  const dressMat = cloth(0.2); // flowing dress, faintly tinted by identity colour
  const bodiceMat = cloth(0.12); // slightly deeper bodice
  const shawlMat = cloth(0.38); // paler draped shawl
  const cordMat = new THREE.MeshStandardMaterial({ color: 0x2a2228, roughness: 0.7 });

  // Pale skin for the medium — cooler / paler than the kit's default tan.
  const paleSkin = new THREE.MeshStandardMaterial({
    color: tint.clone().lerp(new THREE.Color(0xf3e2dc), 0.82),
    roughness: 0.55,
    metalness: 0.02,
  });

  // Crystal-pendant material: faintly glowing in her identity tint.
  const crystalGlow = tint.clone().lerp(new THREE.Color(0xffffff), 0.35);
  const crystalMat = new THREE.MeshStandardMaterial({
    color: crystalGlow,
    emissive: tint.clone(),
    emissiveIntensity: 1.2,
    roughness: 0.18,
    metalness: 0.1,
  });

  // ----- long flowing dress: a tapered skirt to the floor ----------------
  const skirtH = 0.78;
  const skirtTopY = 0.05 + skirtH; // where the bodice meets the skirt
  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.36, skirtH, 20),
    dressMat,
  );
  skirt.position.y = 0.05 + skirtH / 2;
  g.add(skirt);

  // A second flared hem shell so the dress reads as fabric pooling on the floor.
  const hem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.4, 0.16, 20, 1, true),
    dressMat,
  );
  hem.position.y = 0.05 + 0.08;
  g.add(hem);

  // Vertical drape folds down the skirt for a graceful gathered look.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const fold = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.03, skirtH * 0.9, 6),
      dressMat,
    );
    const rad = 0.27;
    fold.position.set(Math.cos(a) * rad, 0.05 + skirtH * 0.46, Math.sin(a) * rad);
    g.add(fold);
  }

  // ----- slim bodice (the torso reference for the animator) --------------
  const bodiceH = 0.34;
  const bodiceY = skirtTopY + bodiceH / 2;
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.16, bodiceH, 16),
    bodiceMat,
  );
  torso.position.y = bodiceY;
  g.add(torso);

  // Waist sash — a thin tinted band where bodice meets skirt.
  const sash = new THREE.Mesh(
    new THREE.CylinderGeometry(0.165, 0.165, 0.05, 16),
    shawlMat,
  );
  sash.position.y = skirtTopY + 0.01;
  g.add(sash);

  // ----- draped shawl over the shoulders + trailing back -----------------
  const shoulderTopY = bodiceY + bodiceH / 2;
  // Shawl drape cowled over the shoulders (open dome shell).
  const shawl = new THREE.Mesh(
    new THREE.SphereGeometry(0.23, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
    shawlMat,
  );
  shawl.scale.set(1.15, 0.85, 1.15);
  shawl.position.y = shoulderTopY - 0.05;
  g.add(shawl);

  // Shawl trailing down the back (an angled flattened cylinder panel).
  const shawlTail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.1, 0.42, 12, 1, true),
    shawlMat,
  );
  shawlTail.scale.set(1.2, 1, 0.4);
  shawlTail.position.set(0, shoulderTopY - 0.24, -0.14);
  shawlTail.rotation.x = -0.22;
  g.add(shawlTail);

  // ----- glowing crystal pendant on a thin cord at the chest -------------
  // Thin cord looping around the neck down to the chest.
  const cord = new THREE.Mesh(
    new THREE.TorusGeometry(0.075, 0.006, 6, 20, Math.PI * 1.4),
    cordMat,
  );
  cord.position.set(0, shoulderTopY - 0.02, 0.04);
  cord.rotation.x = Math.PI * 0.5;
  cord.rotation.z = Math.PI * 0.5;
  g.add(cord);

  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), crystalMat);
  crystal.position.set(0, bodiceY - 0.02, 0.16);
  g.add(crystal);
  // A soft halo sphere around the crystal to read as inner light.
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 12, 10),
    new THREE.MeshStandardMaterial({
      color: crystalGlow,
      emissive: tint.clone(),
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.35,
      roughness: 0.4,
    }),
  );
  halo.position.copy(crystal.position);
  g.add(halo);

  // ----- arms with draped sleeves (shoulder-pivoted) ---------------------
  const armH = 0.5;
  const leftArm = makeArm(-1, 0.18, bodiceY + 0.08, armH, dressMat, paleSkin, 0.22);
  const rightArm = makeArm(1, 0.18, bodiceY + 0.08, armH, dressMat, paleSkin, 0.22);
  g.add(leftArm, rightArm);

  // Loose draped sleeves flaring at the wrist over each arm.
  for (const [sx, arm] of [[-1, leftArm], [1, rightArm]] as const) {
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.13, armH * 0.85, 12, 1, true),
      shawlMat,
    );
    sleeve.position.y = -armH * 0.45;
    sleeve.rotation.z = sx * 0.22;
    arm.add(sleeve);
  }

  // ----- neck + head -----------------------------------------------------
  const r = 0.14;
  const headY = shoulderTopY + 0.2;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 8), paleSkin);
  neck.position.y = headY - 0.15;
  g.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 14), paleSkin);
  head.position.y = headY;
  g.add(head);

  // Tiny earring spheres (glowing faintly to match the pendant).
  for (const sx of [-1, 1]) {
    const earring = new THREE.Mesh(new THREE.SphereGeometry(r * 0.12, 8, 8), crystalMat);
    earring.position.set(sx * r * 0.92, -r * 0.28, 0);
    head.add(earring);
  }

  // Long dark wavy hair beneath the veil (near-black).
  addHair(head, "wavy", 0x201a22, r);

  // Pale face: kohl-rimmed (dark brows), deep plum-grey iris, serene level mood.
  addFace(head, {
    r,
    skin: paleSkin,
    eye: 0x3a2a3a,
    brow: 0x1a141c,
    lip: 0x9a5560,
    mood: 0,
    open: 0.9,
  });

  // ----- translucent veil over the hair, drifting down the back ----------
  const veilMat = new THREE.MeshStandardMaterial({
    color: tint.clone().lerp(new THREE.Color(0xffffff), 0.55),
    roughness: 0.4,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  // A thin cone draping over the crown (head-local: head centre = origin).
  const veil = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.5, 18, 1, true), veilMat);
  veil.position.y = r * 0.4;
  head.add(veil);
  // A trailing veil panel falling behind the head/shoulders.
  const veilTail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.13, 0.4, 14, 1, true, 0, Math.PI),
    veilMat,
  );
  veilTail.position.set(0, -r * 1.0, -r * 0.85);
  veilTail.rotation.x = -0.15;
  head.add(veilTail);

  tagFigure(g, "explorer", { head, torso, leftArm, rightArm }, "odette:" + colorHex);
  return g;
}
