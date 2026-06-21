import { create } from "zustand";
import type { Action, Direction, GameState } from "@dread-hollow/shared";
import { Connection, type ServerMessage } from "../net/connection";

const SERVER_URL =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ??
  `ws://${location.hostname}:8787`;

type Status = "idle" | "connecting" | "connected";

interface Store {
  conn: Connection | null;
  status: Status;
  playerId: string | null;
  roomCode: string | null;
  game: GameState | null;
  error: string | null;
  name: string;

  setName: (name: string) => void;
  createRoom: (name: string) => void;
  joinRoom: (code: string, name: string) => void;
  leave: () => void;

  // game intents (player id is injected automatically)
  chooseCharacter: (characterId: string) => void;
  startGame: () => void;
  moveTo: (toKey: string) => void;
  explore: (door: Direction) => void;
  attackMonster: (monsterId: string) => void;
  attackPlayer: (targetPlayerId: string) => void;
  endTurn: () => void;
}

export const useStore = create<Store>((set, get) => {
  function handle(msg: ServerMessage): void {
    switch (msg.t) {
      case "joined":
        try {
          localStorage.setItem(`dh:pid:${msg.code}`, msg.playerId);
        } catch {
          /* storage may be unavailable */
        }
        set({
          playerId: msg.playerId,
          roomCode: msg.code,
          game: msg.state,
          status: "connected",
          error: null,
        });
        break;
      case "state":
        set({ game: msg.state });
        break;
      case "error":
        set({ error: msg.message });
        break;
      case "pong":
        break;
    }
  }

  function ensureConn(): Connection {
    const existing = get().conn;
    if (existing) return existing;
    const conn = new Connection(SERVER_URL, {
      onMessage: handle,
      onClose: () => set({ error: "Lost the connection to the manor." }),
    });
    set({ conn });
    return conn;
  }

  function act(build: (playerId: string) => Action): void {
    const { conn, playerId } = get();
    if (!conn || !playerId) return;
    conn.send({ t: "action", action: build(playerId) });
  }

  return {
    conn: null,
    status: "idle",
    playerId: null,
    roomCode: null,
    game: null,
    error: null,
    name: (() => {
      try {
        return localStorage.getItem("dh:name") ?? "";
      } catch {
        return "";
      }
    })(),

    setName: (name) => {
      try {
        localStorage.setItem("dh:name", name);
      } catch {
        /* ignore */
      }
      set({ name });
    },

    createRoom: (name) => {
      const conn = ensureConn();
      set({ status: "connecting", error: null });
      conn.send({ t: "create-room", name });
    },

    joinRoom: (code, name) => {
      const conn = ensureConn();
      const upper = code.toUpperCase();
      let resume: string | undefined;
      try {
        resume = localStorage.getItem(`dh:pid:${upper}`) ?? undefined;
      } catch {
        resume = undefined;
      }
      set({ status: "connecting", error: null });
      conn.send({ t: "join-room", code: upper, name, resumePlayerId: resume });
    },

    leave: () => {
      get().conn?.send({ t: "leave-room" });
      set({ game: null, roomCode: null, status: "idle" });
    },

    chooseCharacter: (characterId) =>
      act((playerId) => ({ type: "choose-character", playerId, characterId })),
    startGame: () => act((playerId) => ({ type: "start-game", playerId })),
    moveTo: (toKey) => act((playerId) => ({ type: "move-to", playerId, toKey })),
    explore: (door) => act((playerId) => ({ type: "explore", playerId, door })),
    attackMonster: (monsterId) =>
      act((playerId) => ({ type: "attack", playerId, targetMonsterId: monsterId })),
    attackPlayer: (targetPlayerId) =>
      act((playerId) => ({ type: "attack", playerId, targetPlayerId })),
    endTurn: () => act((playerId) => ({ type: "end-turn", playerId })),
  };
});
