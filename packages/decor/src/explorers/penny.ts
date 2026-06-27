import * as THREE from "three";
import { explorerKit, makeArm, addFace, addHair, tagFigure } from "../index";

/**
 * Penny Ashgrove, 11 — "the runaway child" (identity colour #d8b54a).
 *
 * A small, endearing kid: the whole figure is built at child proportions and
 * then scaled down, but the origin stays at the feet (y = 0) and the head is
 * deliberately oversized for a childlike silhouette. Big bright wide eyes, a
 * cheerful-but-brave little smile, two pigtails with a fringe, a scatter of
 * freckles, a simple pinafore dress, and a stitched rag doll clutched in one
 * hand.
 *
 * Tagged for the shared animator via {@link tagFigure}:
 *   g.userData.figKind = "explorer"
 *   g.userData.parts   = { head, torso, leftArm, rightArm }
 *
 * Node-safe: builds with THREE only, no DOM access.
 */
export function buildPennyFigure(colorHex: string): THREE.Group {
  const g = new THREE.Group();
  g.name = "figure:explorer:penny";

  // explorerKit first — palette + glowing identity base disc (stays full size).
  const { bodyMat, limbMat, skin, cloth } = explorerKit(colorHex, g);

  // The body lives in `inner`, which we scale down at the end so the base disc
  // keeps its proper footprint while the child reads as small.
  const inner = new THREE.Group();
  inner.name = "penny:body";

  const dressMat = cloth(0.4); // pale pinafore tinted by the identity colour
  const strapMat = cloth(0.28);
  const sockMat = cloth(0.7); // pale little socks

  // --- legs: short, with chunky shoes and little socks ---------------------
  const legH = 0.4;
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, legH, 10), limbMat);
    leg.position.set(sx * 0.08, legH / 2, 0);
    inner.add(leg);
    // sock cuff
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.09, 10), sockMat);
    sock.position.set(sx * 0.08, 0.09, 0);
    inner.add(sock);
    // rounded little shoe
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.17), limbMat);
    shoe.position.set(sx * 0.08, 0.03, 0.035);
    inner.add(shoe);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), limbMat);
    toe.position.set(sx * 0.08, 0.04, 0.11);
    toe.scale.set(1, 0.7, 0.9);
    inner.add(toe);
  }

  // --- torso: a little pinafore dress -------------------------------------
  const torsoH = 0.34;
  const torsoY = legH + torsoH / 2;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, torsoH, 12), bodyMat);
  torso.position.y = torsoY;
  inner.add(torso);
  // flared pinafore skirt over the lower torso/hips
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.22, 16, 1, true), dressMat);
  skirt.position.y = torsoY - 0.12;
  inner.add(skirt);
  // pinafore bib panel on the chest
  const bib = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.02), dressMat);
  bib.position.set(0, torsoY + 0.06, 0.13);
  inner.add(bib);
  // two shoulder straps over the bib
  for (const sx of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.2, 0.025), strapMat);
    strap.position.set(sx * 0.07, torsoY + 0.16, 0.12);
    strap.rotation.x = -0.2;
    inner.add(strap);
  }
  // a tiny round pocket button on the bib
  const pocket = new THREE.Mesh(new THREE.CircleGeometry(0.018, 10), strapMat);
  pocket.position.set(0, torsoY + 0.06, 0.142);
  inner.add(pocket);

  // soft rounded shoulders
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), bodyMat);
  shoulders.scale.set(1, 0.5, 0.8);
  shoulders.position.y = torsoY + torsoH / 2;
  inner.add(shoulders);

  // --- arms: thin little arms (shoulder-pivoted for the animator) ----------
  const armH = 0.3;
  const leftArm = makeArm(-1, 0.16, torsoY + 0.08, armH, bodyMat, skin, 0.24);
  const rightArm = makeArm(1, 0.16, torsoY + 0.08, armH, bodyMat, skin, 0.24);
  inner.add(leftArm, rightArm);

  // --- neck + proportionally LARGE childlike head --------------------------
  const headR = 0.23;
  const headY = torsoY + torsoH / 2 + 0.22;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.06, 8), skin);
  neck.position.y = headY - 0.18;
  inner.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 18, 16), skin);
  head.position.y = headY;
  inner.add(head);

  // Big bright wide eyes + cheerful-but-brave mood. addFace places features on
  // the +z hemisphere of the head and parents them to it.
  addFace(head, {
    r: headR,
    skin,
    eye: 0x4a6a8a, // bright blue-grey iris
    brow: 0x6b4423, // warm brown brows to match the hair
    lip: 0xc06a60,
    mood: 0.35, // cheerful but brave
    open: 1.0, // wide open
  });

  // Slightly enlarge the irises so the eyes read big and bright (childlike).
  // addFace builds an iris sphere of radius r*0.09 per eye; bump those up a bit
  // and brighten their emissive so they catch the light.
  for (const child of head.children) {
    if (child instanceof THREE.Mesh && child.geometry instanceof THREE.SphereGeometry) {
      const p = child.geometry.parameters;
      // iris spheres are ~r*0.09; pupils ~r*0.045; eyeballs are scaled, leave them
      if (Math.abs(p.radius - headR * 0.09) < 1e-4) {
        child.scale.setScalar(1.35);
        const m = child.material;
        if (m instanceof THREE.MeshStandardMaterial) {
          m.emissive = new THREE.Color(0x223a52);
          m.emissiveIntensity = 0.25;
        }
      }
    }
  }

  // Two pigtails + a fringe via the shared hair toolkit (warm brown).
  const hairCol = 0x6b4423;
  addHair(head, "pigtails", hairCol, headR);
  // soft fringe sweeping over the brow at the front of the head
  const hairMat = new THREE.MeshStandardMaterial({ color: hairCol, roughness: 0.9 });
  const fringe = new THREE.Mesh(
    new THREE.SphereGeometry(headR * 1.02, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42),
    hairMat,
  );
  fringe.position.set(0, headR * 0.18, headR * 0.12);
  head.add(fringe);
  // a couple of fringe locks dipping toward the eyebrows
  for (const sx of [-0.5, 0.5]) {
    const lock = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.16, 8, 8), hairMat);
    lock.position.set(sx * headR * 0.5, headR * 0.38, headR * 0.78);
    lock.scale.set(1, 1.3, 0.6);
    head.add(lock);
  }
  // little hair ties at the base of each pigtail (a pop of the identity colour)
  const tieMat = cloth(0.15);
  for (const sx of [-1, 1]) {
    const tie = new THREE.Mesh(new THREE.TorusGeometry(headR * 0.16, headR * 0.05, 6, 12), tieMat);
    tie.position.set(sx * headR * 0.92, -headR * 0.02, -headR * 0.08);
    tie.rotation.y = Math.PI / 2;
    head.add(tie);
  }

  // --- a handful of freckles across the cheeks and nose --------------------
  const freckleMat = new THREE.MeshStandardMaterial({ color: 0x9a6b45, roughness: 0.85 });
  const freckles: Array<[number, number]> = [
    [-0.55, -0.02],
    [-0.4, -0.12],
    [-0.62, -0.16],
    [0.55, -0.02],
    [0.4, -0.12],
    [0.62, -0.16],
    [-0.12, -0.06],
    [0.12, -0.06],
  ];
  const fz = headR * 0.86; // front-of-face radius used by addFace
  for (const [fx, fy] of freckles) {
    const freckle = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.028, 6, 6), freckleMat);
    freckle.position.set(fx * headR, fy * headR, fz * 1.0);
    head.add(freckle);
  }

  // --- a little stitched rag doll clutched in the left hand ----------------
  const dollCloth = new THREE.MeshStandardMaterial({ color: 0xb08a5e, roughness: 0.95 });
  const dollAccent = new THREE.MeshStandardMaterial({ color: 0x8a6038, roughness: 0.95 });
  const buttonMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.4, metalness: 0.3 });
  const stitchMat = new THREE.MeshStandardMaterial({ color: 0xf2e3c2, roughness: 0.8 });
  const yarnMat = new THREE.MeshStandardMaterial({ color: 0x7a4a22, roughness: 0.95 });

  const doll = new THREE.Group();
  doll.name = "penny:ragdoll";
  // hand is at roughly y = -armH + 0.02 in the arm pivot; tuck the doll there.
  const handY = -armH + 0.02;

  // stubby cloth body
  const dollBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.08, 4, 8), dollCloth);
  dollBody.position.set(0, handY - 0.01, 0.05);
  doll.add(dollBody);
  // little apron stripe across the body (stitched look)
  const dollApron = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.03, 0.02), dollAccent);
  dollApron.position.set(0, handY - 0.03, 0.092);
  doll.add(dollApron);
  // a row of seam stitches down the chest
  for (let i = 0; i < 3; i++) {
    const stitch = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.016, 0.004), stitchMat);
    stitch.position.set(0, handY + 0.01 - i * 0.02, 0.09);
    doll.add(stitch);
  }

  // round head with two button eyes and a stitched smile
  const dollHead = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), dollCloth);
  dollHead.position.set(0, handY + 0.09, 0.05);
  doll.add(dollHead);
  for (const sx of [-1, 1]) {
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.006, 8), buttonMat);
    button.rotation.x = Math.PI / 2;
    button.position.set(sx * 0.018, handY + 0.095, 0.094);
    doll.add(button);
  }
  // stitched smile (a tiny torus arc)
  const dollMouth = new THREE.Mesh(
    new THREE.TorusGeometry(0.016, 0.003, 6, 10, Math.PI),
    stitchMat,
  );
  dollMouth.rotation.x = Math.PI;
  dollMouth.position.set(0, handY + 0.078, 0.094);
  doll.add(dollMouth);
  // a sprig of yarn hair on top of the doll's head
  const dollHair = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), yarnMat);
  dollHair.position.set(0, handY + 0.125, 0.04);
  dollHair.scale.set(1, 0.7, 1);
  doll.add(dollHair);
  // stubby stitched arms/legs on the doll
  for (const sx of [-1, 1]) {
    const dArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.03, 3, 6), dollCloth);
    dArm.position.set(sx * 0.045, handY + 0.01, 0.05);
    dArm.rotation.z = sx * 0.7;
    doll.add(dArm);
    const dLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.035, 3, 6), dollCloth);
    dLeg.position.set(sx * 0.022, handY - 0.07, 0.05);
    doll.add(dLeg);
  }

  // tilt the doll so it nestles in the crook of her arm, then attach to the hand
  doll.rotation.z = 0.25;
  leftArm.add(doll);

  // --- scale the whole child down; base disc (on g) stays full size --------
  inner.scale.setScalar(0.72);
  g.add(inner);

  // MUST tag for the shared animator.
  tagFigure(g, "explorer", { head, torso, leftArm, rightArm }, "penny:" + colorHex);
  return g;
}
