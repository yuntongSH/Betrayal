import * as THREE from "three";
import { explorerKit, makeArm, addFace, addHair, tagFigure } from "../index";

/**
 * Dr. Mireille Vance, 44 — "the disgraced surgeon" (identity colour #4aa3a2).
 *
 * Slim, composed, clinical. A pale surgical coat/apron skirts to the knee with
 * an open front lapel; a surgical cap covers short dark hair; a face mask sits
 * over the lower face. Cool grey-green eyes, tired sharp brows, a slightly grim
 * set to the mouth (hidden behind the mask). Thin gloved hands grip a glinting
 * metal bonesaw in the right hand.
 *
 * Origin at the feet (y = 0); roughly 1.5 units tall. The returned group is
 * tagged for the shared animator via {@link tagFigure}. THREE-only / node-safe.
 */
export function buildVanceFigure(colorHex: string): THREE.Group {
  const g = new THREE.Group();
  g.name = "figure:explorer:vance";

  // Shared palette + glowing identity base disc.
  const { bodyMat, limbMat, skin, metal, cloth } = explorerKit(colorHex, g);
  const coatMat = cloth(0.25); // pale surgical coat, faintly tinted by identity colour
  const maskMat = cloth(0.55); // paler mask/cap fabric
  const capMat = cloth(0.45);

  // Thin surgical gloves — pale, slightly cool, low sheen.
  const gloveMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colorHex).lerp(new THREE.Color(0xeef2f0), 0.78),
    roughness: 0.45,
    metalness: 0.02,
  });

  // ----- slim legs (scrub trousers) --------------------------------------
  const legH = 0.5;
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, legH, 10), limbMat);
    leg.position.set(sx * 0.09, 0.05 + legH / 2, 0);
    g.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.2), limbMat);
    foot.position.set(sx * 0.09, 0.08, 0.04);
    g.add(foot);
  }

  // ----- slim torso ------------------------------------------------------
  const torsoH = 0.5;
  const torsoY = 0.05 + legH + torsoH / 2;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, torsoH, 12), bodyMat);
  torso.position.y = torsoY;
  g.add(torso);

  // Long surgical apron/coat skirting to the knee (open cylinder shell).
  const apron = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.215, 0.44, 16, 1, true),
    coatMat,
  );
  apron.position.y = torsoY - 0.19;
  g.add(apron);

  // Coat body over the chest — a second tinted shell so the coat reads as worn
  // over the torso rather than painted on.
  const coatBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.145, 0.17, torsoH * 0.92, 14, 1, true),
    coatMat,
  );
  coatBody.position.y = torsoY + 0.01;
  g.add(coatBody);

  // Open front lapels — two angled panels parting at the sternum, leaving a gap.
  for (const sx of [-1, 1]) {
    const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.05, torsoH * 0.9, 0.025), coatMat);
    lapel.position.set(sx * 0.05, torsoY, 0.155);
    lapel.rotation.z = sx * 0.18; // splay outward toward the shoulders
    lapel.rotation.y = sx * 0.12;
    g.add(lapel);
  }
  // Collar band around the back/sides of the neckline.
  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.12, 0.022, 8, 16, Math.PI * 1.35),
    coatMat,
  );
  collar.position.set(0, torsoY + torsoH / 2 - 0.02, 0);
  collar.rotation.x = Math.PI / 2;
  collar.rotation.z = -Math.PI * 0.18;
  g.add(collar);

  // A small chest tie / button placket hint down the closed lower front.
  const placket = new THREE.Mesh(new THREE.BoxGeometry(0.02, torsoH * 0.55, 0.02), maskMat);
  placket.position.set(0, torsoY - 0.1, 0.16);
  g.add(placket);

  // Shoulders.
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), coatMat);
  shoulders.scale.set(1, 0.5, 0.8);
  shoulders.position.y = torsoY + torsoH / 2;
  g.add(shoulders);

  // ----- arms (shoulder-pivoted so the animator can swing them) ----------
  const armH = 0.42;
  const leftArm = makeArm(-1, 0.21, torsoY + 0.1, armH, coatMat, gloveMat, 0.16);
  const rightArm = makeArm(1, 0.21, torsoY + 0.1, armH, coatMat, gloveMat, 0.16);
  g.add(leftArm, rightArm);

  // Glove cuffs — thin tinted bands where the sleeve meets the wrist.
  for (const arm of [leftArm, rightArm]) {
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.04, 10), gloveMat);
    cuff.position.y = -armH + 0.07;
    arm.add(cuff);
  }

  // ----- glinting metal bonesaw in the right hand ------------------------
  // Handle gripped by the gloved fist, blade extending forward (+z).
  const sawHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.16, 8), limbMat);
  sawHandle.position.set(0, -armH + 0.02, 0.0);
  sawHandle.rotation.x = Math.PI / 2;
  rightArm.add(sawHandle);

  // Thin saw blade — a slim metal box reaching out past the hand.
  const sawBlade = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.05, 0.24), metal);
  sawBlade.position.set(0, -armH + 0.02, 0.2);
  rightArm.add(sawBlade);

  // Spine of the saw (a slightly thicker top edge for a real silhouette).
  const sawSpine = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.018, 0.24), metal);
  sawSpine.position.set(0, -armH + 0.05, 0.2);
  rightArm.add(sawSpine);

  // ----- neck + head -----------------------------------------------------
  const r = 0.15;
  const headY = torsoY + torsoH / 2 + 0.2;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 8), skin);
  neck.position.y = headY - 0.15;
  g.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 14), skin);
  head.position.y = headY;
  g.add(head);

  // Real face: cool grey-green eyes, tired sharp brows, a slightly grim mood.
  addFace(head, {
    r,
    skin,
    eye: 0x6f8a7a,
    brow: 0x2a221b,
    lip: 0x8a4a44,
    mood: -0.2,
    open: 0.85,
  });

  // Short dark hair tucked under the cap (dark brown).
  addHair(head, "short", 0x2c241c, r);

  // ----- surgical cap + face mask (added after hair so they sit on top) ---
  // Surgical cap — a fabric dome over the crown, hiding most of the hair.
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.08, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
    capMat,
  );
  cap.position.set(0, r * 0.04, -r * 0.04);
  head.add(cap);
  // Cap band / tie hint around the lower edge at the back.
  const capBand = new THREE.Mesh(
    new THREE.TorusGeometry(r * 1.02, r * 0.06, 8, 18, Math.PI * 1.3),
    capMat,
  );
  capBand.position.set(0, r * 0.2, -r * 0.06);
  capBand.rotation.x = Math.PI / 2;
  capBand.rotation.z = -Math.PI * 0.15;
  head.add(capBand);

  // Surgical face mask over the lower face (covers the mouth; front = +z).
  const mask = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.04, 16, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.42),
    maskMat,
  );
  mask.position.set(0, -r * 0.02, 0);
  head.add(mask);
  // Mask ear loops — thin bands curving toward the ears.
  for (const sx of [-1, 1]) {
    const loop = new THREE.Mesh(
      new THREE.TorusGeometry(r * 0.32, r * 0.03, 6, 12, Math.PI),
      maskMat,
    );
    loop.position.set(sx * r * 0.7, -r * 0.18, 0);
    loop.rotation.y = sx * Math.PI * 0.5;
    loop.rotation.z = Math.PI * 0.5;
    head.add(loop);
  }

  tagFigure(g, "explorer", { head, torso, leftArm, rightArm }, "vance:" + colorHex);
  return g;
}
