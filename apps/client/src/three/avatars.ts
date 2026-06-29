/**
 * Per-character 3D model map (CC0 Quaternius Ultimate Modular humans), mirrored
 * from the standalone artifact's EXPLORER_MODELS so both frontends render the
 * same clothed, animated characters. Files are served from the client's public
 * dir (a symlink to artifact/models), so the paths are root-absolute.
 *
 * Any archetype absent here falls back to the procedural figure in PlayerToken.
 */
export interface AvatarEntry {
  url: string;
  /** Target standing height in world units (feet at the token origin). */
  h: number;
  /** Optional identity tint, blended gently into the materials for the mood. */
  tint?: number;
}

export const AVATARS: Record<string, AvatarEntry> = {
  crow: { url: "/models/people/M_Farmer.gltf", h: 1.9, tint: 0x6b4a2c },
  vance: { url: "/models/people/W_Formal.gltf", h: 1.68, tint: 0x46615f },
  odette: { url: "/models/people/W_Witch.gltf", h: 1.66, tint: 0x4a2d63 },
  tobias: { url: "/models/people/M_King.gltf", h: 1.75, tint: 0x40301f },
  thorne: { url: "/models/people/M_Adventurer.gltf", h: 1.8, tint: 0x44472c },
  penny: { url: "/models/people/W_Casual.gltf", h: 1.36, tint: 0x8a6a30 },
};
