import { CHARACTERS_BY_ID, ROOMS_BY_ID } from "@dread-hollow/shared";
import { useStore } from "../state/store";

export function PartyRoster() {
  const game = useStore((s) => s.game)!;
  const myId = useStore((s) => s.playerId);

  return (
    <div className="party-roster">
      {game.players.map((p) => {
        const char = p.characterId ? CHARACTERS_BY_ID[p.characterId] : undefined;
        const room = p.position ? game.house[p.position] : undefined;
        const roomName = room ? ROOMS_BY_ID[room.roomId]?.name : "—";
        const active = game.activePlayerId === p.id;
        return (
          <div
            key={p.id}
            className={`roster-row ${active ? "active" : ""} ${!p.alive ? "dead" : ""}`}
          >
            <span
              className="roster-dot"
              style={{ background: char?.color ?? "#888" }}
            />
            <span className="roster-name">
              {p.name}
              {p.id === myId ? " (you)" : ""}
            </span>
            {p.side === "traitor" && <span className="roster-traitor">☠</span>}
            <span className="roster-room muted small">{p.alive ? roomName : "lost"}</span>
          </div>
        );
      })}
    </div>
  );
}
