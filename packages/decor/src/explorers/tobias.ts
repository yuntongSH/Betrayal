import * as THREE from "three";
import { explorerKit, makeArm, addFace, addHair, tagFigure } from "../index";

/**
 * Brother Tobias, 57 — "the doubting monk" (identity colour #7a6db0).
 *
 * An old monk wrapped in a floor-length hooded robe. Instead of legs, a long
 * cone of robe cloth tapers from the waist to the floor; a second flared hem
 * shell lets it read as fabric pooling on the ground. A hood is drawn partly
 * up — a half-dome and cowl of robe material behind and over the crown — so it
 * shadows his weathered brow. A rope belt rings the waist with a knot and a
 * hanging tasselled end. A small wooden cross pendant swings on a cord at his
 * chest. His arms are folded forward so the draped sleeves meet and the hands
 * clasp together in front of the waist. The face is heavy with age: sagging
 * brows, a few thin forehead wrinkle lines, and a calm, weary mood; a grey
 * monk's tonsure ring circles the head beneath the hood.
 *
 * Origin at the feet (y = 0); roughly 1.5 units tall. The returned group is
 * tagged for the shared animator via {@link tagFigure}. THREE-only / node-safe.
 */
export function buildTobiasFigure(colorHex: string): THREE.Group {
  const g = new THREE.Group();
  g.name = "figure:explorer:tobias";

  // Shared palette + glowing identity base disc.
  const { tint, skin, cloth } = explorerKit(colorHex, g);
  const robeMat = cloth(0.08, 0.28); // deep, desaturated monk's robe
  const robeDark = cloth(0.04, 0.42); // shadowed inner-hood / under-folds

  // Weathered, sallow old skin — a little greyer/paler than the kit tan.
  const oldSkin = new THREE.MeshStandardMaterial({
    color: tint.clone().lerp(new THREE.Color(0xd9c2a4), 0.7).multiplyScalar(0.92),
    roughness: 0.7,
    metalness: 0.02,
  });

  // Rope / cord material for the belt, knot and pendant cord.
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xb59a5a, roughness: 0.85 });
  // Worn wooden cross.
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.8, metalness: 0.02 });

  // ----- floor-length robe: a tapered cone from the floor to the waist ----
  const robeH = 1.06;
  const waistY = 0.05 + robeH; // where the skirt of the robe meets the torso
  const robe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.36, robeH, 18),
    robeMat,
  );
  robe.position.y = 0.05 + robeH / 2;
  g.add(robe);

  // Flared hem shell pooling on the floor.
  const hem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.4, 0.14, 18, 1, true),
    robeMat,
  );
  hem.position.y = 0.05 + 0.07;
  g.add(hem);

  // Vertical robe folds for a heavy gathered cloth look.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const fold = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.032, robeH * 0.86, 6),
      robeDark,
    );
    const rad = 0.28;
    fold.position.set(Math.cos(a) * rad, 0.05 + robeH * 0.46, Math.sin(a) * rad);
    g.add(fold);
  }

  // ----- torso (the animator reference) ----------------------------------
  const torsoH = 0.34;
  const torsoY = waistY + torsoH / 2;
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.2, torsoH, 14),
    robeMat,
  );
  torso.position.y = torsoY;
  g.add(torso);

  // Slightly hunched shoulders (open dome) — reads as an old, stooped frame.
  const shoulderTopY = torsoY + torsoH / 2;
  const shoulders = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    robeMat,
  );
  shoulders.scale.set(1.05, 0.62, 0.9);
  shoulders.position.y = shoulderTopY - 0.04;
  g.add(shoulders);

  // ----- rope belt at the waist with a knot + hanging tasselled end ------
  const beltY = waistY + 0.02;
  const belt = new THREE.Mesh(
    new THREE.TorusGeometry(0.205, 0.022, 8, 20),
    ropeMat,
  );
  belt.rotation.x = Math.PI / 2;
  belt.position.y = beltY;
  g.add(belt);

  // Knot sitting at the front-left of the belt.
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), ropeMat);
  knot.scale.set(1.2, 1, 1.2);
  knot.position.set(0.13, beltY, 0.16);
  g.add(knot);
  // Hanging end of the rope falling from the knot.
  const ropeEnd = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.01, 0.26, 7),
    ropeMat,
  );
  ropeEnd.position.set(0.14, beltY - 0.15, 0.16);
  g.add(ropeEnd);
  // Frayed tassel tip at the bottom of the hanging end.
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.07, 7), ropeMat);
  tassel.position.set(0.14, beltY - 0.3, 0.16);
  tassel.rotation.x = Math.PI; // flare opens downward
  g.add(tassel);

  // ----- wooden cross pendant on a cord at the chest ---------------------
  const cordTopY = shoulderTopY - 0.02;
  const crossY = torsoY + 0.02;
  // Thin cord looping at the neck down to the chest.
  const cord = new THREE.Mesh(
    new THREE.TorusGeometry(0.07, 0.005, 6, 20, Math.PI * 1.3),
    ropeMat,
  );
  cord.position.set(0, cordTopY, 0.05);
  cord.rotation.x = Math.PI * 0.5;
  cord.rotation.z = Math.PI * 0.5;
  g.add(cord);
  // Cross — vertical beam + horizontal beam, parented so they sit together.
  const cross = new THREE.Group();
  cross.position.set(0, crossY, 0.2);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.11, 0.02), woodMat);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.022, 0.02), woodMat);
  crossH.position.y = 0.018;
  cross.add(crossV, crossH);
  g.add(cross);

  // ----- arms folded forward so the hands clasp at the waist -------------
  // Bring the shoulder pivots inward + a strong forward swing (restZ) so the
  // draped sleeves angle in toward the centre and the hands meet in front.
  const armH = 0.46;
  const leftArm = makeArm(-1, 0.16, shoulderTopY - 0.05, armH, robeMat, oldSkin, 0.95);
  const rightArm = makeArm(1, 0.16, shoulderTopY - 0.05, armH, robeMat, oldSkin, 0.95);
  // Tip each pivot forward so the forearms cross in front of the belly.
  leftArm.rotation.x = -0.85;
  rightArm.rotation.x = -0.85;
  g.add(leftArm, rightArm);

  // Wide draped sleeves flaring over each folded arm.
  for (const [sx, arm] of [[-1, leftArm], [1, rightArm]] as const) {
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.12, armH * 0.8, 12, 1, true),
      robeMat,
    );
    sleeve.position.y = -armH * 0.42;
    sleeve.rotation.z = sx * 0.18;
    arm.add(sleeve);
  }

  // Clasped-hands cluster where the two sleeves meet in front of the waist.
  const hands = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), oldSkin);
  hands.scale.set(1.35, 0.85, 1);
  hands.position.set(0, waistY - 0.02, 0.22);
  g.add(hands);

  // ----- neck + head -----------------------------------------------------
  const r = 0.15;
  const headY = shoulderTopY + 0.2;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.09, 8), oldSkin);
  neck.position.y = headY - 0.16;
  g.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 14), oldSkin);
  head.position.y = headY;
  g.add(head);

  // Grey short hair around the sides/back (sets the cap), then a tonsure ring.
  addHair(head, "short", 0x9a9a92, r);
  // Monk's tonsure: a grey ring of cropped hair, bald crown inside it.
  const tonsure = new THREE.Mesh(
    new THREE.TorusGeometry(r * 0.78, r * 0.16, 8, 20),
    new THREE.MeshStandardMaterial({ color: 0x9a9a92, roughness: 0.95 }),
  );
  tonsure.rotation.x = Math.PI / 2;
  tonsure.position.y = r * 0.5;
  tonsure.scale.set(1, 1, 0.78);
  head.add(tonsure);

  // Weathered old face: heavy/low brows, weary calm mood, half-open eyes.
  addFace(head, {
    r,
    skin: oldSkin,
    eye: 0x4a4036,
    brow: 0x8f8f86, // grizzled grey brows
    lip: 0x8a5b52,
    mood: -0.1, // calm, weary
    open: 0.72,
  });

  // A few thin forehead wrinkle lines (flat boxes across the brow), and a
  // heavier sagging brow ridge above each eye to push the elderly read.
  const wrinkleMat = new THREE.MeshStandardMaterial({
    color: oldSkin.color.clone().multiplyScalar(0.8),
    roughness: 0.85,
  });
  for (let i = 0; i < 3; i++) {
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(r * 0.62, r * 0.025, r * 0.02),
      wrinkleMat,
    );
    line.position.set(0, r * (0.42 + i * 0.11), r * 0.84);
    head.add(line);
  }
  // Sagging brow ridges (small flattened boxes) drooping at the outer corner.
  for (const sx of [-1, 1]) {
    const ridge = new THREE.Mesh(
      new THREE.BoxGeometry(r * 0.34, r * 0.1, r * 0.12),
      oldSkin,
    );
    ridge.position.set(sx * r * 0.42, r * 0.3, r * 0.78);
    ridge.rotation.z = sx * -0.18; // droop down toward the outer edge
    head.add(ridge);
  }

  // ----- hood partly up over the crown, shadowing the brow ---------------
  // Inner dark shell so the hood opening reads as shadow around the face.
  const hoodInner = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.16, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
    robeDark,
  );
  hoodInner.position.set(0, r * 0.16, -r * 0.18);
  head.add(hoodInner);
  // Outer hood dome covering the top + back of the head.
  const hoodOuter = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.32, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
    robeMat,
  );
  hoodOuter.scale.set(1.05, 1.12, 1.12);
  hoodOuter.position.set(0, r * 0.2, -r * 0.24);
  head.add(hoodOuter);
  // A pointed peak/cowl at the back of the hood (anchored to the body so it
  // drapes onto the shoulders rather than riding fully with head turns).
  const cowl = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.34, 16, 1, true),
    robeMat,
  );
  cowl.position.set(0, headY + 0.02, -0.12);
  cowl.rotation.x = -0.32;
  g.add(cowl);
  // Hood collar pooling around the neck/shoulders.
  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.05, 8, 18),
    robeMat,
  );
  collar.rotation.x = Math.PI / 2;
  collar.position.y = headY - 0.12;
  collar.scale.set(1, 1, 0.92);
  g.add(collar);

  tagFigure(g, "explorer", { head, torso, leftArm, rightArm }, "tobias:" + colorHex);
  return g;
}
