import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import http from "http";
import { Server as SocketIOServer } from "socket.io";

type RoomUser = {
  id: string;
  name: string;
};

const roomUsers: Map<string, Map<string, RoomUser>> = new Map();

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: ["http://localhost:3000"],
    credentials: true,
  })
);

// Health check endpoint
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Placeholder auth + boards routes (we will implement later)
app.get("/api/auth/session", (_req, res) => {
  res.status(401).json({ error: "Not implemented yet" });
});

app.post("/api/boards", (_req, res) => {
  res.status(501).json({ error: "Not implemented yet" });
});

app.post("/api/boards/:boardId", (_req, res) => {
  res.status(501).json({ error: "Not implemented yet" });
});

app.get("/api/boards/:boardId", (_req, res) => {
  res.status(501).json({ error: "Not implemented yet" });
});

const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: ["http://localhost:3000"],
    credentials: true,
  },
});

function emitRoomUsers(roomId: string) {
  const usersInRoom = roomUsers.get(roomId);
  if (!usersInRoom) return;

  const usersArray = Array.from(usersInRoom.values());
  io.to(roomId).emit("roomUsers", { users: usersArray });
}

// Socket.io
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("joinRoom", (payload: { boardId: string }) => {
    const roomId = payload.boardId;
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);

    const user: RoomUser = {
      id: socket.id,
      name: `User-${socket.id.slice(0, 5)}`,
    };

    let users = roomUsers.get(roomId);
    if (!users) {
      users = new Map<string, RoomUser>();
      roomUsers.set(roomId, users);
    }
    users.set(socket.id, user);

    emitRoomUsers(roomId);
  });

  socket.on("cursorMove", (payload: { x: number; y: number }) => {
    const { x, y } = payload;
    const rooms = Array.from(socket.rooms).filter((roomId) => roomId !== socket.id);

    rooms.forEach((roomId) => {
      io.to(roomId).emit("cursorUpdate", {
        userId: socket.id,
        x,
        y,
      });
    });
  });

  // Drawing sync
  socket.on("draw", (payload: { boardId: string; stroke: any }) => {
    const { boardId, stroke } = payload;
    socket.to(boardId).emit("drawUpdate", { stroke });
  });

  socket.on("addObject", (payload: { boardId: string; object: any }) => {
    const { boardId, object } = payload;
    socket.to(boardId).emit("objectAdded", { object });
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);

    roomUsers.forEach((users, roomId) => {
      if (users.has(socket.id)) {
        users.delete(socket.id);
        emitRoomUsers(roomId);
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});