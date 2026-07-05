import { useState } from "react";
import type { CSSProperties } from "react";
import { useStore } from "../state/store";
import { HelpButton } from "./HelpButton";

/**
 * The self-drawing floorplan (viewBox 560×400): twelve hand-placed rooms on a
 * loose grid, each outline a single path with door gaps left in its edges —
 * the same ink language the in-game minimap uses. `pathLength=100` normalizes
 * every perimeter so one dash keyframe draws them all; `r` is the matching
 * fill rect (fills fade in after their outline finishes).
 */
const PLAN_ROOMS: ReadonlyArray<{ d: string; r: [number, number, number, number] }> = [
  // entrance porch, bottom-right — drawn first, and kept clear of the card
  // (the pulsing candle dot lives here; the plan's center hides behind it)
  { d: "M452 312H536V380H503M485 380H452V312", r: [452, 312, 84, 68] },
  // entrance hall — front door gap south, foyer door north
  { d: "M244 306H271M289 306H316V378H289M271 378H244V306", r: [244, 306, 72, 72] },
  // foyer — doors on all four sides
  {
    d: "M236 216H271M289 216H324V245M324 263V302H289M271 302H236V263M236 245V216",
    r: [236, 216, 88, 86],
  },
  // library
  { d: "M132 224H232V251M232 269V296H132V224", r: [132, 224, 100, 72] },
  // conservatory
  { d: "M336 226H428V253M428 271V298H336V271M336 253V226", r: [336, 226, 92, 72] },
  // grand staircase
  { d: "M236 118H324V156M324 174V212H289M271 212H236V118", r: [236, 118, 88, 94] },
  // dining room
  { d: "M128 128H230V157M230 175V204H128V175M128 157V128", r: [128, 128, 102, 76] },
  // ballroom
  { d: "M340 120H450V212H404M386 212H340V175M340 157V120", r: [340, 120, 110, 92] },
  // study
  { d: "M436 226H520V302H436V273M436 255V226", r: [436, 226, 84, 76] },
  // kitchen
  { d: "M40 128H124V160M124 178V210H40V128", r: [40, 128, 84, 82] },
  // chapel
  { d: "M132 40H224V116H187M169 116H132V40", r: [132, 40, 92, 76] },
  // gallery
  { d: "M340 40H446V112H402M384 112H340V40", r: [340, 40, 106, 72] },
];

export function Lobby() {
  const name = useStore((s) => s.name);
  const setName = useStore((s) => s.setName);
  const createRoom = useStore((s) => s.createRoom);
  const joinRoom = useStore((s) => s.joinRoom);
  const playSolo = useStore((s) => s.playSolo);
  const status = useStore((s) => s.status);
  const [code, setCode] = useState("");

  const trimmed = name.trim();
  const canPlay = trimmed.length > 0;

  return (
    <div className="lobby">
      <svg className="lobby-plan" viewBox="0 0 560 400" aria-hidden="true">
        {PLAN_ROOMS.map((room, i) => (
          <g key={i} style={{ "--d": `${0.2 + i * 0.7}s` } as CSSProperties}>
            <rect
              className="lp-fill"
              x={room.r[0]}
              y={room.r[1]}
              width={room.r[2]}
              height={room.r[3]}
            />
            <path className="lp-line" d={room.d} pathLength={100} />
          </g>
        ))}
        {/* one candle waits at the entrance */}
        <circle className="lp-dot" cx={494} cy={346} r={4} />
      </svg>
      <HelpButton className="lobby-help" />
      <div className="lobby-card">
        <p className="lobby-eyebrow">For 3–6 explorers · one of you will turn</p>
        <h1 className="title">
          <svg className="title-flame" viewBox="0 0 24 32" aria-hidden="true">
            <defs>
              <linearGradient id="dh-flame" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stopColor="#8c2f23" />
                <stop offset="0.45" stopColor="#e8a85a" />
                <stop offset="1" stopColor="#f6d8a0" />
              </linearGradient>
            </defs>
            <path
              d="M12 2C15.5 9 20 13.5 20 21a8 8 0 0 1-16 0C4 13.5 8.5 9 12 2Z"
              fill="url(#dh-flame)"
            />
          </svg>{" "}
          Dread Hollow
        </h1>
        <p className="tagline">
          A manor that builds itself, one dreadful room at a time — until one of
          you stops being a friend.
        </p>

        <label className="field">
          <span>Your name</span>
          <input
            value={name}
            maxLength={20}
            placeholder="e.g. Eleanor"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <button
          className="btn primary"
          disabled={!canPlay || status === "connecting"}
          onClick={() => createRoom(trimmed)}
        >
          Open a new manor
        </button>

        <button
          className="btn"
          disabled={!canPlay || status === "connecting"}
          onClick={() => playSolo(trimmed)}
        >
          Play solo vs 3 bots
        </button>

        <div className="divider">or join one</div>

        <div className="join-row">
          <input
            className="code-input"
            value={code}
            maxLength={4}
            placeholder="CODE"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button
            className="btn"
            disabled={!canPlay || code.length < 4 || status === "connecting"}
            onClick={() => joinRoom(code, trimmed)}
          >
            Enter
          </button>
        </div>

        <p className="fineprint">
          Open in multiple tabs or share the 4-letter code with friends. Best
          with 3–6 explorers.
        </p>
      </div>
    </div>
  );
}
