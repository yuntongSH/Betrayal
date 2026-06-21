/**
 * The authoritative game server.
 *
 * Browsers connect over WebSockets, create or join a room by code, and send
 * player *intents*. The server runs the shared rules engine — the single source
 * of truth — and broadcasts the resulting game state to everyone in the room.
 * Clients can ask, but the server decides.
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import type { Action } from "@dread-hollow/shared";
import { RoomManager, type GameRoom } from "./rooms.js";
import type { ClientMessage, ServerMessage } from "./protocol.js";

const PORT = Number(process.env.PORT ?? 8787);
const manager = new RoomManager();

interface Session {
  playerId: string;
  name: string;
  room: GameRoom | null;
}

const sessions = new Map<WebSocket, Session>();

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room: GameRoom): void {
  const payload: ServerMessage = { t: "state", state: room.state };
  const data = JSON.stringify(payload);
  for (const ws of room.sockets.values()) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}

function attachToRoom(
  ws: WebSocket,
  session: Session,
  room: GameRoom,
  name: string,
  resumePlayerId?: string,
): void {
  const playerId = resumePlayerId ?? randomUUID();
  session.playerId = playerId;
  session.name = name;
  session.room = room;
  room.sockets.set(playerId, ws);

  // Joining (or rejoining) is just another validated engine action.
  const join: Action = { type: "join", playerId, name };
  room.apply(join);

  send(ws, { t: "joined", code: room.code, playerId, state: room.state });
  broadcast(room);
}

function leaveRoom(ws: WebSocket, session: Session): void {
  const room = session.room;
  if (!room) return;
  room.sockets.delete(session.playerId);
  room.apply({ type: "leave", playerId: session.playerId });
  session.room = null;
  if (room.isEmpty) {
    manager.remove(room.code);
  } else {
    broadcast(room);
  }
}

function handleMessage(ws: WebSocket, session: Session, raw: string): void {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw) as ClientMessage;
  } catch {
    send(ws, { t: "error", message: "Malformed message." });
    return;
  }

  switch (msg.t) {
    case "ping":
      send(ws, { t: "pong" });
      break;

    case "create-room": {
      if (session.room) leaveRoom(ws, session);
      const room = manager.create();
      attachToRoom(ws, session, room, msg.name, msg.resumePlayerId);
      break;
    }

    case "join-room": {
      const room = manager.get(msg.code);
      if (!room) {
        send(ws, { t: "error", message: `No room "${msg.code}".` });
        return;
      }
      if (session.room && session.room !== room) leaveRoom(ws, session);
      attachToRoom(ws, session, room, msg.name, msg.resumePlayerId);
      break;
    }

    case "action": {
      const room = session.room;
      if (!room) {
        send(ws, { t: "error", message: "You are not in a room." });
        return;
      }
      // Never trust the client's identity — stamp the session's player id.
      const action = { ...msg.action, playerId: session.playerId } as Action;
      room.apply(action);
      broadcast(room);
      break;
    }

    case "leave-room":
      leaveRoom(ws, session);
      break;
  }
}

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(426, { "content-type": "text/plain" });
  res.end("This endpoint speaks WebSocket only.");
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  const session: Session = { playerId: randomUUID(), name: "Wanderer", room: null };
  sessions.set(ws, session);

  ws.on("message", (data) => handleMessage(ws, session, data.toString()));
  ws.on("close", () => {
    leaveRoom(ws, session);
    sessions.delete(ws);
  });
  ws.on("error", () => {
    leaveRoom(ws, session);
    sessions.delete(ws);
  });
});

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`🕯️  Dread Hollow server listening on ws://localhost:${PORT}`);
});
