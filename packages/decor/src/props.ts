import * as THREE from "three";

/**
 * Signature keepsake props — one per explorer, matching the `keepsake` line on
 * their character card. Each is built from primitives (no external assets) at
 * real-world scale (meters) and attached to a bone of the rigged glTF body, so
 * it rides the idle/walk animation: Thorne's camera hangs at his chest,
 * Tobias's lantern swings from his hand, Penny clutches Mister Buttons.
 *
 * Bone names on the Quaternius rigs are "Wrist.L" / "Chest" etc., but three's
 * GLTFLoader strips the punctuation ("WristL"), and SkeletonUtils.clone keeps
 * the stripped names — so bones are matched by a normalized (lowercase,
 * alphanumeric-only) comparison rather than exact strings.
 *
 * FRESH materials per call, same as the rest of decor — callers may dispose.
 */

function mat(color: number, rough = 0.8, metal = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

function glow(color: number, intensity = 1.4): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.5,
  });
}

/** Thorne — a dented box camera on a leather strap, resting on the sternum. */
function boxCamera(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.07), mat(0x1c1c1e, 0.45, 0.5));
  g.add(body);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.05, 14), mat(0x101012, 0.3, 0.7));
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.05;
  g.add(lens);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.006, 12), glow(0x8fb0c8, 0.5));
  glass.rotation.x = Math.PI / 2;
  glass.position.z = 0.078;
  g.add(glass);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8), mat(0x777770, 0.35, 0.8));
  knob.position.set(0.06, 0.065, 0);
  g.add(knob);
  // The strap: two thin leather runs angling up toward the shoulders.
  for (const sx of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.008), mat(0x4a3320, 0.9));
    strap.position.set(sx * 0.075, 0.1, -0.01);
    strap.rotation.z = -sx * 0.5;
    g.add(strap);
  }
  return g;
}

/** Vance — the physician's bag the board never reclaimed, hung from a fist. */
function physicianBag(): THREE.Group {
  const g = new THREE.Group();
  const leather = mat(0x2e2320, 0.85);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.09), leather);
  body.position.y = -0.15;
  g.add(body);
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 10), leather);
  spine.rotation.z = Math.PI / 2;
  spine.position.y = -0.08;
  g.add(spine);
  const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.012), mat(0xc8a23a, 0.3, 0.8));
  clasp.position.set(0, -0.075, 0.05);
  g.add(clasp);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 8, 14, Math.PI), leather);
  handle.position.y = -0.045;
  g.add(handle);
  return g;
}

/** Odette — her mother's silver pendulum locket, hanging over the collarbone. */
function pendulumLocket(): THREE.Group {
  const g = new THREE.Group();
  const chainMat = mat(0xb8bcc4, 0.35, 0.9);
  // Chain: a shallow V of thin cylinders meeting at the pendant.
  for (const sx of [-1, 1]) {
    const link = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6), chainMat);
    link.position.set(sx * 0.035, 0.055, -0.005);
    link.rotation.z = -sx * 0.55;
    g.add(link);
  }
  const pendant = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), mat(0xd0d4dc, 0.25, 1));
  g.add(pendant);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.03, 10), mat(0xd0d4dc, 0.25, 1));
  tip.position.y = -0.033;
  tip.rotation.x = Math.PI;
  g.add(tip);
  return g;
}

/** Tobias — the brass storm-lantern from the abbey crypt, with a live flame. */
function stormLantern(withLight: boolean): THREE.Group {
  const g = new THREE.Group();
  const brass = mat(0x8a6a30, 0.45, 0.7);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 8, 14), brass);
  ring.position.y = -0.03;
  g.add(ring);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.035, 12), brass);
  cap.position.y = -0.075;
  g.add(cap);
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.04, 0.09, 12),
    new THREE.MeshStandardMaterial({
      color: 0xE8C88A,
      roughness: 0.2,
      transparent: true,
      opacity: 0.35,
    }),
  );
  glass.position.y = -0.14;
  g.add(glass);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), glow(0xffae3a, 2.2));
  flame.position.y = -0.15;
  g.add(flame);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.02, 12), brass);
  base.position.y = -0.195;
  g.add(base);
  if (withLight) {
    const light = new THREE.PointLight(0xffb45a, 2.4, 3.2, 2);
    light.position.y = -0.14;
    g.add(light);
  }
  return g;
}

/** Crow — the iron bar he bent the night of the fire, gripped like a relic. */
function bentIronBar(): THREE.Group {
  const g = new THREE.Group();
  const iron = mat(0x3a3d42, 0.55, 0.85);
  // Two straight runs meeting at a shallow kink — unmistakably a bar that lost
  // an argument with someone strong. Gripped at the kink.
  for (const s of [-1, 1]) {
    const run = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.24, 8), iron);
    run.rotation.z = s * 0.35;
    // One end of each run lands exactly on the origin, forming the kink.
    run.position.set(-Math.sin(0.35) * 0.12, s * Math.cos(0.35) * 0.12, 0);
    g.add(run);
  }
  const kink = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), iron);
  g.add(kink);
  return g;
}

/** Penny — Mister Buttons, a one-eyed sewn rabbit, held on by a small fist. */
function misterButtons(): THREE.Group {
  const g = new THREE.Group();
  const cloth = mat(0x9a8468, 0.95);
  const wornCloth = mat(0x857057, 0.95);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), cloth);
  body.scale.set(0.85, 1.15, 0.8);
  body.position.y = -0.1;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), cloth);
  head.position.y = -0.035;
  g.add(head);
  // One ear proud, one flopped — he has seen things.
  const earUp = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.05, 4, 8), cloth);
  earUp.position.set(-0.016, 0.02, 0);
  earUp.rotation.z = 0.15;
  g.add(earUp);
  const earDown = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.045, 4, 8), wornCloth);
  earDown.position.set(0.022, -0.005, 0);
  earDown.rotation.z = 1.35;
  g.add(earDown);
  // The one button eye (the other is a bare stitch).
  const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.004, 8), mat(0x1a1a1c, 0.3, 0.4));
  eye.rotation.x = Math.PI / 2;
  eye.position.set(-0.012, -0.03, 0.032);
  g.add(eye);
  const stitch = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.003, 0.003), mat(0x4a3a30, 0.9));
  stitch.position.set(0.014, -0.03, 0.033);
  stitch.rotation.z = 0.6;
  g.add(stitch);
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.03, 4, 8), wornCloth);
  arm.position.set(0.03, -0.09, 0.01);
  arm.rotation.z = 1.2;
  g.add(arm);
  return g;
}

interface KeepsakeSpec {
  build: (withLight: boolean) => THREE.Group;
  /** Normalized bone names to try, best first (lowercase, alphanumeric only). */
  bones: string[];
  /** Offset from the bone origin in METERS, in the MODEL's frame at attach
   *  time (x right, y up, z forward — the way the character faces). */
  offset: [number, number, number];
  /** Euler rotation in the model's frame at attach time. */
  rot?: [number, number, number];
}

const KEEPSAKES: Record<string, KeepsakeSpec> = {
  thorne: { build: () => boxCamera(), bones: ["chest", "torso"], offset: [0, -0.02, 0.13] },
  vance: { build: () => physicianBag(), bones: ["wristl", "handl"], offset: [0, -0.02, 0.03] },
  odette: { build: () => pendulumLocket(), bones: ["chest", "torso"], offset: [0, 0.05, 0.1] },
  tobias: { build: (l) => stormLantern(l), bones: ["wristr", "handr"], offset: [0, -0.04, 0.1] },
  crow: { build: () => bentIronBar(), bones: ["wristr", "handr"], offset: [0, -0.06, 0.07], rot: [0.25, 0, 0.15] },
  penny: { build: () => misterButtons(), bones: ["wristl", "handl"], offset: [0, -0.05, 0.06] },
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function findBone(root: THREE.Object3D, names: string[]): THREE.Object3D | null {
  for (const want of names) {
    let hit: THREE.Object3D | null = null;
    root.traverse((o) => {
      if (!hit && norm(o.name) === want) hit = o;
    });
    if (hit) return hit;
  }
  return null;
}

/**
 * Attach `archetype`'s keepsake to the rigged model under `root`. Call AFTER
 * the model has been scaled to its final height AND posed (advance the mixer
 * once so the skeleton is out of its T-pose bind stance) — the attachment
 * transform is computed from the bone's CURRENT pose.
 *
 * The spec's offset/rot are authored in the model's own upright frame (meters;
 * x right, y up, z the facing direction). They're converted into the bone's
 * space here, so the prop starts upright in the character's hands and then
 * rides the bone through idle sway and walk swings. The prop is also
 * counter-scaled against the bone's world scale, keeping true real-world size
 * on every body (Penny's rabbit doesn't grow on Crow).
 *
 * Returns the prop group (already parented), or null if no bone matched.
 */
export function attachKeepsake(
  root: THREE.Object3D,
  archetype: string,
  opts: { light?: boolean } = {},
): THREE.Group | null {
  const spec = KEEPSAKES[archetype];
  if (!spec) return null;
  const bone = findBone(root, spec.bones);
  if (!bone) return null;
  root.updateMatrixWorld(true);

  const boneW = bone.getWorldPosition(new THREE.Vector3());
  const boneQ = bone.getWorldQuaternion(new THREE.Quaternion());
  const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
  const ws = bone.getWorldScale(new THREE.Vector3());
  const inv = 1 / Math.max(1e-6, (ws.x + ws.y + ws.z) / 3);

  const holder = new THREE.Group();
  holder.name = `keepsake:${archetype}`;
  holder.scale.setScalar(inv);
  // Orient the holder so its axes match the MODEL's frame (not the bone's),
  // and place it at bone + offset, with the offset rotated to the model's facing.
  holder.quaternion.copy(boneQ).invert().multiply(rootQ);
  const offW = new THREE.Vector3(...spec.offset).applyQuaternion(rootQ);
  holder.position.copy(bone.worldToLocal(boneW.add(offW)));

  const prop = spec.build(opts.light !== false);
  if (spec.rot) prop.rotation.set(...spec.rot);
  prop.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  holder.add(prop);
  bone.add(holder);
  return holder;
}
