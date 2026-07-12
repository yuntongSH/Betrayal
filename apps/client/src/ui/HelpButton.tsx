import { useEffect, useState } from "react";

/** A "?" button that opens an original how-to-play overlay. */
export function HelpButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "?") setOpen((o) => !o);
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        className={`help-btn ${className}`}
        title="How to play (?)"
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      {open && (
        <div className="help-overlay" onClick={() => setOpen(false)}>
          <div className="help-card" onClick={(e) => e.stopPropagation()}>
            <h2>How to play</h2>
            <ol className="help-list">
              <li>
                <strong>Explore.</strong> On your turn, move up to your{" "}
                <em>Speed</em>. Click a glowing room to walk there; click a flame
                arrow to push through a doorway and reveal a new room.
              </li>
              <li>
                <strong>Discover.</strong> New rooms trigger their special effect
                and draw cards: <em>Events</em> resolve at once, <em>Items</em>{" "}
                are kept, and <em>Omens</em> are kept but dangerous.
              </li>
              <li>
                <strong>The haunt roll.</strong> Every omen drawn rolls six dice;
                if the total is below the number of omens in play, the house turns.
              </li>
              <li>
                <strong>The betrayal.</strong> One explorer becomes the{" "}
                <em>traitor</em>; the rest are <em>heroes</em>. Each side gets a
                secret goal; check your panel.
              </li>
              <li>
                <strong>Fight.</strong> Click a monster in your room to strike it;
                use the HUD buttons to attack a rival. The traitor's monsters hunt
                each round.
              </li>
              <li>
                <strong>Win.</strong> The instant a side completes its objective,
                the game ends.
              </li>
            </ol>
            <p className="muted small">
              Shortcuts: <kbd>E</kbd> end turn · <kbd>?</kbd> toggle this help ·{" "}
              <kbd>Esc</kbd> close
            </p>
            <button className="btn primary" onClick={() => setOpen(false)}>
              Into the dark
            </button>
          </div>
        </div>
      )}
    </>
  );
}
