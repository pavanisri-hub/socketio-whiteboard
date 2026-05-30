import { io, Socket } from "socket.io-client";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:3001";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(WS_URL, {
      withCredentials: true,
    });
  }
  return socket;
}