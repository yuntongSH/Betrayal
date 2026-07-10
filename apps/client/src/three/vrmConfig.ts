/**
 * Opt-in custom VRM avatar (experimental, local to this browser): open the
 * game with `?vrm=<https url to a .vrm>` to see YOUR explorer as that avatar
 * — realistic VRoid/photoreal VRMs give the "as real as possible" headroom
 * the bundled CC0 models can't. `?vrm=default` uses the mannequin bundled
 * with @pmndrs/viverse (no download needed — also our smoke-test rig). The
 * choice persists in localStorage; `?vrm=off` clears it. Other players still
 * see your character's default body until the avatar URL travels through the
 * room protocol.
 */
export function myVrmUrl(): string | null {
  try {
    const q = new URLSearchParams(window.location.search).get("vrm");
    if (q === "off") {
      localStorage.removeItem("dh:vrm");
      return null;
    }
    if (q && (q === "default" || /^https?:\/\/.+\.vrm(\?.*)?$/i.test(q))) {
      localStorage.setItem("dh:vrm", q);
      return q;
    }
    return localStorage.getItem("dh:vrm") || null;
  } catch {
    return null;
  }
}
