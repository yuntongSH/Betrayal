import { toggleView, useView } from "../state/view";

/** Eye button: step into your explorer's eyes, or back up to the bird's-eye
 *  board. Same swap as the V key. */
export function ViewToggle() {
  const mode = useView((s) => s.mode);
  const first = mode === "first";
  return (
    <button
      className="audio-toggle"
      title={first ? "Back to the bird's-eye board (V)" : "See through your explorer's eyes (V)"}
      onClick={toggleView}
    >
      {first ? "🗺" : "👁"}
    </button>
  );
}
