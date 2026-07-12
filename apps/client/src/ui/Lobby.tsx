import { useState } from "react";
import { useStore } from "../state/store";
import { DuskScene } from "./DuskScene";
import { HelpButton } from "./HelpButton";

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
      <DuskScene />
      <HelpButton className="lobby-help" />
      {/* Title lockup rides the dusk scene itself; only the form gets glass. */}
      <div className="lobby-hero">
        <p className="lobby-eyebrow">For 3–6 explorers · one of you will turn</p>
        <h1 className="title">Dread Hollow</h1>
        <div className="title-rule" aria-hidden="true">
          <i />
          <svg className="title-flame" viewBox="0 0 24 32" focusable="false">
            <defs>
              <linearGradient id="dh-flame" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stopColor="#c2412f" />
                <stop offset="0.45" stopColor="#e8a85a" />
                <stop offset="1" stopColor="#f6e3bd" />
              </linearGradient>
            </defs>
            <path
              d="M12 2C15.5 9.5 21 12.5 21 20a9 9 0 0 1-18 0c0-5 2.6-7.6 4.6-10.4 1.1 1.9 2.4 3.1 2.4 3.1C10.6 9.1 11.4 5.4 12 2z"
              fill="url(#dh-flame)"
            />
          </svg>
          <i />
        </div>
        <p className="tagline">
          A manor that builds itself, one dreadful room at a time — until one of
          you stops being a friend.
        </p>
      </div>
      <div className="lobby-card">
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
          <span className="btn-sub">pick your explorer · invite friends by code · add bots</span>
        </button>

        <button
          className="btn"
          disabled={!canPlay || status === "connecting"}
          onClick={() => playSolo(trimmed)}
        >
          Play solo vs 3 bots
          <span className="btn-sub">instant game — character assigned, straight into the hall</span>
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
