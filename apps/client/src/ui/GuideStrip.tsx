/**
 * The guide strip — one quiet line under the turn banner that always answers
 * "what am I supposed to do right now?". Phase- and turn-aware:
 * exploring (steps left, how to reveal rooms), waiting (whose turn, how close
 * the haunt looms), the haunt (YOUR side's goal, how to fight), the end.
 * New players stop being lost; veterans read it as a status line.
 */
import { useStore } from "../state/store";

export function GuideStrip() {
  const game = useStore((s) => s.game);
  const myId = useStore((s) => s.playerId);
  if (!game || game.phase === "lobby") return null;

  const me = game.players.find((p) => p.id === myId);
  const myTurn = game.activePlayerId === myId && game.phase !== "ended";
  const activeName = game.players.find((p) => p.id === game.activePlayerId)?.name ?? "…";

  let text: string;
  let tone: "" | " urgent" = "";

  if (game.phase === "ended") {
    text = "The night is over. Open a new manor to play again.";
  } else if (game.phase === "haunt" && game.haunt) {
    const traitor = me?.side === "traitor";
    const goal = traitor ? game.haunt.traitorGoal : game.haunt.heroGoal;
    if (!me?.alive) {
      text = "You are lost to the house. Watch how the night ends.";
    } else if (myTurn) {
      text = `${goal} · click a monster in your room to strike`;
      tone = " urgent";
    } else {
      text = goal;
    }
  } else if (myTurn) {
    text =
      game.movementLeft > 0
        ? `Your goal for now: explore. Walk into a flame-marked doorway to reveal a new room. New rooms give cards. ${game.movementLeft} step${game.movementLeft === 1 ? "" : "s"} left · E ends your turn`
        : "Out of steps: Investigate (a Knowledge test), Steady (recover a trait), or press E to end your turn";
  } else {
    const omens =
      game.omenCount === 0
        ? "no omens in play yet"
        : `${game.omenCount} omen${game.omenCount === 1 ? "" : "s"} in play`;
    text = `${activeName} explores · ${omens} · every omen tempts the haunt, and when it comes, one of you turns`;
  }

  return <div className={`guide-strip${tone}`}>{text}</div>;
}
