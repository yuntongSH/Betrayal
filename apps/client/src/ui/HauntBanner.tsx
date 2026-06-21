import { useEffect, useState } from "react";
import { useStore } from "../state/store";

/** A one-time dramatic reveal when the haunt begins, dismissible per scenario. */
export function HauntBanner() {
  const game = useStore((s) => s.game)!;
  const myId = useStore((s) => s.playerId);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const haunt = game.haunt;
  useEffect(() => {
    // Reset dismissal if a (hypothetical) new haunt id appears.
    if (haunt && dismissed && dismissed !== haunt.id) setDismissed(null);
  }, [haunt, dismissed]);

  if (!haunt || game.phase !== "haunt") return null;
  if (dismissed === haunt.id) return null;

  const me = game.players.find((p) => p.id === myId);
  const amTraitor = me?.side === "traitor";
  const traitorNames = haunt.traitorIds
    .map((id) => game.players.find((p) => p.id === id)?.name ?? "someone")
    .join(", ");

  return (
    <div className="haunt-reveal" onClick={() => setDismissed(haunt.id)}>
      <div className="haunt-card" onClick={(e) => e.stopPropagation()}>
        <div className="haunt-kicker">The house turns…</div>
        <h2>{haunt.name}</h2>
        <p className="haunt-who">
          {amTraitor ? (
            <strong className="traitor-text">You are the traitor.</strong>
          ) : (
            <>The traitor is <strong className="traitor-text">{traitorNames}</strong>.</>
          )}
        </p>
        <div className="haunt-goals">
          <div className={amTraitor ? "goal-active" : ""}>
            <span className="muted small">Traitor</span>
            {haunt.traitorGoal}
          </div>
          <div className={!amTraitor ? "goal-active" : ""}>
            <span className="muted small">Heroes</span>
            {haunt.heroGoal}
          </div>
        </div>
        <button className="btn primary" onClick={() => setDismissed(haunt.id)}>
          {amTraitor ? "Begin the betrayal" : "Survive"}
        </button>
      </div>
    </div>
  );
}
