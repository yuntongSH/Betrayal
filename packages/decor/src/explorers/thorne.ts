import * as THREE from "three";
import { explorerKit, makeArm, addFace, addHair, tagFigure } from "../index";

/**
 * Marcus Thorne, 41 — "the war photographer" (identity colour #5a8f5a).
 *
 * A rugged field journalist mid-assignment. A practical belted field
 * coat/jacket (faintly tinted by the identity colour) over a worn torso, with a
 * leather satchel strap slung across the chest down to a small hip bag. Swept-
 * back brown hair and short dark stubble across the jaw. Focused, slightly
 * narrowed brown eyes under heavy brows and a determined set to the mouth. His
 * signature: a boxy camera held at the chest — a body box, a protruding lens,
 * and a tiny emissive flash glint — hung from a thin neck strap.
 *
 * Origin at the feet (y = 0); roughly 1.5 units tall. The returned group is
 * tagged for the shared animator via {@link tagFigure}. THREE-only / node-safe.
 */
export function buildThorneFigure(colorHex: string): THREE.Group {
  const g = new THREE.Group();
  g.name = "figure:explorer:thorne";

  // Shared palette + glowing identity base disc.
  const { bodyMat, limbMat, skin, cloth } = explorerKit(colorHex, g);
  const coatMat = cloth(0.0, 0.15); // field coat — identity colour, slightly darkened

  // Worn brown leather for the satchel strap + hip bag.
  const leatherMat = new THREE.MeshStandardMaterial({
    color: 0x4a3320,
    roughness: 0.85,
    metalness: 0.05,
  });
  // Dark utility material for the camera body + neck strap.
  const camMat = new THREE.MeshStandardMaterial({
    color: 0x1c1c1e,
    roughness: 0.4,
    metalness: 0.5,
  });

  // ----- legs (sturdy field trousers + boots) ----------------------------
  const legH = 0.5;
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, legH, 10), limbMat);
    leg.position.set(sx * 0.11, 0.05 + legH / 2, 0);
    g.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.22), limbMat);
    foot.position.set(sx * 0.11, 0.09, 0.05);
    g.add(foot);
  }

  // ----- torso under a practical field coat ------------------------------
  const torsoH = 0.46;
  const torsoY = 0.05 + legH + torsoH / 2;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, torsoH, 12), bodyMat);
  torso.position.y = torsoY;
  g.add(torso);

  // Coat skirt — an open tinted shell flaring to the hips.
  const coat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.26, 0.5, 14, 1, true),
    coatMat,
  );
  coat.position.y = torsoY - 0.12;
  g.add(coat);

  // Coat body over the chest so the jacket reads as worn over the torso.
  const coatBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.185, 0.205, torsoH * 0.94, 14, 1, true),
    coatMat,
  );
  coatBody.position.y = torsoY + 0.01;
  g.add(coatBody);

  // Open front lapels — two angled panels parting at the sternum.
  for (const sx of [-1, 1]) {
    const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.05, torsoH * 0.85, 0.025), coatMat);
    lapel.position.set(sx * 0.055, torsoY, 0.185);
    lapel.rotation.z = sx * 0.16;
    lapel.rotation.y = sx * 0.1;
    g.add(lapel);
  }

  // Cinched utility belt at the waist.
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.05, 16), leatherMat);
  belt.position.y = torsoY - 0.18;
  g.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.03), camMat);
  buckle.position.set(0, torsoY - 0.18, 0.2);
  g.add(buckle);

  // Shoulders.
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), coatMat);
  shoulders.scale.set(1, 0.5, 0.8);
  shoulders.position.y = torsoY + torsoH / 2;
  g.add(shoulders);

  // ----- satchel strap across the chest + hip bag ------------------------
  // Thin angled band running shoulder-to-hip across the front of the coat.
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.62, 0.02), leatherMat);
  strap.position.set(0, torsoY, 0.2);
  strap.rotation.z = 0.7;
  strap.rotation.x = 0.05;
  g.add(strap);

  // Small leather hip bag hanging at the side where the strap lands.
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.1), leatherMat);
  bag.position.set(0.22, torsoY - 0.18, 0.12);
  g.add(bag);
  // Bag flap + buckle for a little detail.
  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.185, 0.06, 0.105), leatherMat);
  flap.position.set(0.22, torsoY - 0.1, 0.125);
  g.add(flap);
  const bagBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.02), camMat);
  bagBuckle.position.set(0.22, torsoY - 0.14, 0.17);
  g.add(bagBuckle);

  // ----- arms (raised to cradle the camera at the chest) -----------------
  const armH = 0.4;
  const leftArm = makeArm(-1, 0.26, torsoY + 0.06, armH, coatMat, skin, -0.1);
  const rightArm = makeArm(1, 0.26, torsoY + 0.06, armH, coatMat, skin, -0.1);
  leftArm.rotation.x = -0.7;
  rightArm.rotation.x = -0.7;
  g.add(leftArm, rightArm);

  // ----- neck + head -----------------------------------------------------
  const r = 0.15;
  const headY = torsoY + torsoH / 2 + 0.2;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 8), skin);
  neck.position.y = headY - 0.15;
  g.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 14), skin);
  head.position.y = headY;
  g.add(head);

  // Focused, slightly narrowed brown eyes under heavy brows; determined mouth.
  addFace(head, {
    r,
    skin,
    eye: 0x4a3a2a,
    brow: 0x2a2018,
    lip: 0x8a4a44,
    mood: 0.05,
    open: 0.8,
  });

  // Swept-back brown hair.
  addHair(head, "swept", 0x4a3526, r);

  // Short stubble across the jaw — a faint darker patch over the lower face,
  // plus a light scatter of tiny dots for texture (deterministic placement).
  const stubbleMat = new THREE.MeshStandardMaterial({
    color: 0x3a2c20,
    roughness: 0.95,
    metalness: 0.0,
  });
  // Flattened shell hugging the lower-front of the face (chin + jawline).
  const stubblePatch = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.02, 16, 12, 0, Math.PI * 2, Math.PI * 0.58, Math.PI * 0.34),
    stubbleMat,
  );
  stubblePatch.position.set(0, -r * 0.04, r * 0.02);
  stubblePatch.scale.set(1, 1, 0.95);
  head.add(stubblePatch);
  // A few tiny dots along the jaw for stubble texture.
  const dotGeo = new THREE.SphereGeometry(r * 0.025, 5, 4);
  const jawDots: ReadonlyArray<readonly [number, number, number]> = [
    [-0.5, -0.5, 0.78],
    [0.5, -0.5, 0.78],
    [-0.3, -0.62, 0.74],
    [0.3, -0.62, 0.74],
    [0.0, -0.66, 0.76],
  ];
  for (const [dx, dy, dz] of jawDots) {
    const dot = new THREE.Mesh(dotGeo, stubbleMat);
    dot.position.set(dx * r, dy * r, dz * r);
    head.add(dot);
  }

  // ----- signature: boxy camera on a neck strap --------------------------
  // Thin strap band looping from the neck down to the camera at the chest.
  const camY = torsoY + 0.04;
  const camZ = 0.22;
  for (const sx of [-1, 1]) {
    const strapBand = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.3, 0.018), camMat);
    // Top sits at the neck/shoulder, bottom meets the camera body.
    strapBand.position.set(sx * 0.05, headY - 0.22, camZ - 0.02);
    strapBand.rotation.x = -0.25;
    strapBand.rotation.z = sx * 0.18;
    g.add(strapBand);
  }

  // Camera body box held at the chest.
  const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.1), camMat);
  camBody.position.set(0, camY, camZ);
  g.add(camBody);
  // Top plate / pentaprism hump for silhouette.
  const camHump = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.08), camMat);
  camHump.position.set(0, camY + 0.09, camZ);
  g.add(camHump);

  // Protruding lens cylinder.
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 14), camMat);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, camY, camZ + 0.08);
  g.add(lens);
  // Glass front element (faint glint).
  const lensGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.01, 14),
    new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.15, metalness: 0.6, emissive: 0x112233, emissiveIntensity: 0.3 }),
  );
  lensGlass.rotation.x = Math.PI / 2;
  lensGlass.position.set(0, camY, camZ + 0.135);
  g.add(lensGlass);

  // Tiny emissive flash highlight on the top plate.
  const flash = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.05, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xfff4d0, emissive: 0xfff0c0, emissiveIntensity: 1.2, roughness: 0.3 }),
  );
  flash.position.set(0, camY + 0.08, camZ + 0.01);
  g.add(flash);

  tagFigure(g, "explorer", { head, torso, leftArm, rightArm }, "thorne:" + colorHex);
  return g;
}
