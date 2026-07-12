import { useState } from "react";
import type { CSSProperties } from "react";
import { CHARACTERS, CHARACTERS_BY_ID, DIFFICULTIES, TRAITS } from "@dread-hollow/shared";
import type { CharacterDef } from "@dread-hollow/shared";
import { useStore } from "../state/store";
import { crazy } from "../net/crazygames";
import { DuskScene } from "./DuskScene";
import { Portrait } from "./Portrait";

/** Typed abbreviations on the intake slips — the archivist's shorthand. */
const TRAIT_ABBR: Record<string, string> = {
  speed: "SPD",
  might: "MGT",
  sanity: "SAN",
  knowledge: "KNW",
};

const DIFFICULTY_BLURB: Record<string, string> = {
  relaxed: "Gentler haunts — monsters hit softer and die sooner.",
  standard: "The tuned, intended challenge.",
  nightmare: "The house is merciless — stronger, tougher horrors.",
};

/** The dossier: what the house already knows about this guest. */
function Dossier({ c }: { c: CharacterDef }) {
  const bondTo = CHARACTERS_BY_ID[c.bond.with]!;
  const rows: [string, string][] = [
    ["Born", c.birthday],
    ["Keeps", c.keepsake],
    ["Fears", c.fear],
    ["Hobbies", c.hobbies.join(" · ")],
  ];
  return (
    <div className="dossier" style={{ borderLeftColor: c.color }}>
      <div className="dossier-head">
        <strong>{c.name}</strong>
        <em className="muted">
          {c.title}, {c.age}
        </em>
      </div>
      <div className="dossier-rows">
        {rows.map(([k, v]) => (
          <div key={k} className="dossier-row">
            <span className="dossier-key">{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </div>
      <p className="dossier-bio">{c.bio}</p>
      <p className="dossier-bond">
        <span className="bond-thread">●</span>{" "}
        <span className="bond-name">{bondTo.name}</span> — {c.bond.text}
      </p>
    </div>
  );
}

export function RoomScreen() {
  const game = useStore((s) => s.game)!;
  const playerId = useStore((s) => s.playerId);
  const roomCode = useStore((s) => s.roomCode);
  const chooseCharacter = useStore((s) => s.chooseCharacter);
  const startGame = useStore((s) => s.startGame);
  const addBot = useStore((s) => s.addBot);
  const setDifficulty = useStore((s) => s.setDifficulty);
  const leave = useStore((s) => s.leave);

  const me = game.players.find((p) => p.id === playerId);
  const takenBy = new Map(
    game.players.filter((p) => p.characterId).map((p) => [p.characterId!, p]),
  );
  const everyoneReady =
    game.players.length > 0 && game.players.every((p) => p.characterId);

  // One-click invites: a CrazyGames invite link on the portal, otherwise a
  // plain ?join=CODE URL to wherever this build is hosted.
  const [copied, setCopied] = useState(false);
  const copyInvite = () => {
    if (!roomCode) return;
    const url = new URL(location.href);
    url.searchParams.set("join", roomCode);
    const link = crazy.inviteLink(roomCode) ?? url.toString();
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    };
    navigator.clipboard?.writeText(link).then(done, done);
  };

  // The dossier follows the pointer, falling back to your pick.
  const [hovered, setHovered] = useState<string | null>(null);
  const shown =
    (hovered && CHARACTERS_BY_ID[hovered]) ||
    (me?.characterId && CHARACTERS_BY_ID[me.characterId]) ||
    CHARACTERS[0]!;

  return (
    <div className="room-screen">
      <DuskScene />
      <header className="room-header">
        <div>
          <h2>The Foyer</h2>
          <p className="muted">Choose who walks into the dark.</p>
        </div>
        <div className="room-code">
          <span className="muted">Room code</span>
          <strong>{roomCode}</strong>
          <button className="btn invite-btn" onClick={copyInvite}>
            {copied ? "Copied ✓" : "Copy invite link"}
          </button>
        </div>
      </header>

      <div className="room-body">
        <section className="char-col">
          <div className="char-grid">
          {CHARACTERS.map((c) => {
            const owner = takenBy.get(c.id);
            const mine = owner?.id === playerId;
            const disabled = !!owner && !mine;
            return (
              <button
                key={c.id}
                className={`char-card ${mine ? "mine" : ""} ${disabled ? "taken" : ""}`}
                style={{ "--char": c.color } as CSSProperties}
                disabled={disabled}
                onClick={() => chooseCharacter(c.id)}
                onMouseEnter={() => setHovered(c.id)}
                onMouseLeave={() => setHovered((h) => (h === c.id ? null : h))}
              >
                {/* an intake slip pinned to the board: ribbon in the
                    explorer's color hanging under a brass pin */}
                <span className="card-ribbon" aria-hidden="true" />
                <span className="card-pin" aria-hidden="true" />
                <div className="char-photo">
                  <span className="char-initial" aria-hidden="true">
                    {c.name.charAt(0)}
                  </span>
                  <Portrait id={c.id} />
                </div>
                <strong className="char-name">{c.name}</strong>
                <em className="char-epithet">{c.title}</em>
                <div className="char-traits">
                  {TRAITS.map((t) => (
                    <span key={t} className="trait-type">
                      {TRAIT_ABBR[t]}&nbsp;<b>{c.traits[t].values[c.traits[t].start]}</b>
                    </span>
                  ))}
                </div>
                {disabled && owner && (
                  <span className="claim-stamp">
                    claimed
                    <b>— {owner.name}</b>
                  </span>
                )}
                {mine && <span className="wax-seal">you</span>}
              </button>
            );
          })}
          </div>
          <Dossier c={shown} />
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
              <div className="difficulty" title={DIFFICULTY_BLURB[game.difficulty ?? "standard"]}>
                <span className="diff-label">Difficulty</span>
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    className={`diff-opt ${(game.difficulty ?? "standard") === d ? "sel" : ""}`}
                    onClick={() => setDifficulty(d)}
                    title={DIFFICULTY_BLURB[d]}
                  >
                    {d[0]!.toUpperCase() + d.slice(1)}
                  </button>
                ))}
              </div>
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
