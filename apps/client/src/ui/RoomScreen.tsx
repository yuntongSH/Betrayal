import { CHARACTERS, TRAITS } from "@dread-hollow/shared";
import { useStore } from "../state/store";

export function RoomScreen() {
  const game = useStore((s) => s.game)!;
  const playerId = useStore((s) => s.playerId);
  const roomCode = useStore((s) => s.roomCode);
  const chooseCharacter = useStore((s) => s.chooseCharacter);
  const startGame = useStore((s) => s.startGame);
  const addBot = useStore((s) => s.addBot);
  const leave = useStore((s) => s.leave);

  const me = game.players.find((p) => p.id === playerId);
  const takenBy = new Map(
    game.players.filter((p) => p.characterId).map((p) => [p.characterId!, p]),
  );
  const everyoneReady =
    game.players.length > 0 && game.players.every((p) => p.characterId);

  return (
    <div className="room-screen">
      <header className="room-header">
        <div>
          <h2>The Foyer</h2>
          <p className="muted">Choose who walks into the dark.</p>
        </div>
        <div className="room-code">
          <span className="muted">Room code</span>
          <strong>{roomCode}</strong>
        </div>
      </header>

      <div className="room-body">
        <section className="char-grid">
          {CHARACTERS.map((c) => {
            const owner = takenBy.get(c.id);
            const mine = owner?.id === playerId;
            const disabled = !!owner && !mine;
            return (
              <button
                key={c.id}
                className={`char-card ${mine ? "mine" : ""} ${disabled ? "taken" : ""}`}
                style={{ borderColor: c.color }}
                disabled={disabled}
                onClick={() => chooseCharacter(c.id)}
              >
                <div className="char-avatar" style={{ background: c.color }}>
                  {c.name.charAt(0)}
                </div>
                <div className="char-info">
                  <strong>{c.name}</strong>
                  <em>{c.title}</em>
                  <div className="char-traits">
                    {TRAITS.map((t) => (
                      <span key={t} className="trait-chip">
                        {t.slice(0, 3)} {c.traits[t].values[c.traits[t].start]}
                      </span>
                    ))}
                  </div>
                </div>
                {owner && (
                  <div className="char-owner" style={{ color: c.color }}>
                    {mine ? "You" : owner.name}
                  </div>
                )}
              </button>
            );
          })}
        </section>

        <aside className="party-panel">
          <h3>Party ({game.players.length})</h3>
          <ul className="party-list">
            {game.players.map((p) => (
              <li key={p.id} className={p.id === playerId ? "me" : ""}>
                <span className={`dot ${p.connected ? "on" : "off"}`} />
                {p.name}
                {p.isHost && <span className="badge">host</span>}
                {p.isBot && <span className="badge bot">bot</span>}
                {p.characterId && (
                  <span className="muted small">
                    {CHARACTERS.find((c) => c.id === p.characterId)?.name}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {me?.isHost ? (
            <>
              <button
                className="btn"
                disabled={game.players.length >= CHARACTERS.length}
                onClick={addBot}
              >
                + Add bot
              </button>
              <button
                className="btn primary"
                disabled={!everyoneReady}
                onClick={startGame}
              >
                {everyoneReady ? "Begin the descent" : "Waiting for the party…"}
              </button>
              <p className="muted small">
                Small parties are topped up to 3 with bots automatically.
              </p>
            </>
          ) : (
            <p className="muted">Waiting for the host to begin…</p>
          )}
          <button className="btn ghost" onClick={leave}>
            Leave
          </button>
        </aside>
      </div>
    </div>
  );
}
