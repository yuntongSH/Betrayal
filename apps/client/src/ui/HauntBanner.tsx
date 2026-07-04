import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { useBeats } from "../state/beats";
import { ambient } from "../audio/ambient";

/** A one-time dramatic reveal when the haunt begins, dismissible per scenario. */
export function HauntBanner() {
  const game = useStore((s) => s.game)!;
  const myId = useStore((s) => s.playerId);
  const beatsBusy = useBeats((s) => !!s.active || s.queue.length > 0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const stungFor = useRef<string | null>(null);

  const haunt = game.haunt;
  useEffect(() => {
    // Reset dismissal if a (hypothetical) new haunt id appears.
    if (haunt && dismissed && dismissed !== haunt.id) setDismissed(null);
    // Sound the dissonant swell once, the moment the house turns.
    if (haunt && game.phase === "haunt" && stungFor.current !== haunt.id) {
      stungFor.current = haunt.id;
      ambient.stinger();
    }
  }, [haunt, dismissed, game.phase]);

  // Let the beat that triggered the haunt (usually an omen card) finish first.
  if (beatsBusy) return null;
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
          {haunt.traitorIds.length === 0 ? (
            <strong className="traitor-text">The house itself rises against you all.</strong>
          ) : amTraitor ? (
            <strong className="traitor-text">You are the traitor.</strong>
          ) : (
            <>The traitor is <strong className="traitor-text">{traitorNames}</strong>.</>
          )}
        </p>
        {/* Each player sees only their own charge — the opposing side's
            objective is secret (and the server never sends it to them). */}
        <div className="haunt-goals">
          <div className="goal-active">
            <span className="muted small">{amTraitor ? "Your charge" : "Your goal"}</span>
            {amTraitor ? haunt.traitorGoal : haunt.heroGoal}
          </div>
        </div>
        <button className="btn primary" onClick={() => setDismissed(haunt.id)}>
          {amTraitor ? "Begin the betrayal" : "Survive"}
        </button>
      </div>
    </div>
  );
}
