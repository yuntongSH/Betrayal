/**
 * A hero's 2D face, baked offline from their 3D model (front-frozen wardrobe
 * render, head crop — scripts in the session notes) and shipped next to the
 * glTF bodies at /models/portraits/<id>.webp. Rendered INSIDE a medallion
 * (.char-avatar/.roster-avatar/.tp-avatar/.db-disc), covering the initial
 * letter beneath; if the image ever fails to load it removes itself and the
 * letter shows again — the medallion never goes blank.
 */
export function Portrait({ id }: { id: string }) {
  return (
    <img
      className="pface"
      src={`/models/portraits/${id}.webp`}
      alt=""
      draggable={false}
      onError={(e) => e.currentTarget.remove()}
    />
  );
}
