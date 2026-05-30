import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { getSocket } from "../socket";

type RoomUser = {
  id: string;
  name: string;
};

type RemoteCursor = {
  userId: string;
  x: number;
  y: number;
};

type Tool = "pen" | "rectangle";

type Stroke = {
  tool: "pen";
  color: string;
  width: number;
  points: { x: number; y: number }[];
};

function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const [users, setUsers] = useState<RoomUser[]>([]);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [activeTool, setActiveTool] = useState<Tool>("pen");
  const [strokeColor, setStrokeColor] = useState<string>("#000000");
  const [strokeWidth, setStrokeWidth] = useState<number>(3);

  // keep latest values in refs so handlers always see current value
  const strokeColorRef = useRef<string>(strokeColor);
  const strokeWidthRef = useRef<number>(strokeWidth);

  useEffect(() => {
    strokeColorRef.current = strokeColor;
  }, [strokeColor]);

  useEffect(() => {
    strokeWidthRef.current = strokeWidth;
  }, [strokeWidth]);

  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const strokesRef = useRef<Stroke[]>([]);

  // Socket.io: join room + roomUsers + cursorUpdate
  useEffect(() => {
    if (!boardId) return;

    const socket = getSocket();

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit("joinRoom", { boardId });

    const handleRoomUsers = (payload: { users: RoomUser[] }) => {
      setUsers(payload.users);
    };

    const handleCursorUpdate = (payload: RemoteCursor) => {
      setRemoteCursors((prev) => ({
        ...prev,
        [payload.userId]: payload,
      }));
    };

    socket.on("roomUsers", handleRoomUsers);
    socket.on("cursorUpdate", handleCursorUpdate);

    return () => {
      socket.off("roomUsers", handleRoomUsers);
      socket.off("cursorUpdate", handleCursorUpdate);
    };
  }, [boardId]);

  // Initialize canvas size + context
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctxRef.current = ctx;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    (window as any).getCanvasAsJSON = () => {
      return {
        objects: strokesRef.current,
      };
    };

    return () => {
      (window as any).getCanvasAsJSON = undefined;
    };
  }, []);

  // Local mouse move -> cursorMove event (for remote cursors)
  const handleMouseMoveContainer = (e: React.MouseEvent<HTMLDivElement>) => {
    const socket = getSocket();
    if (!socket.connected) return;

    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    socket.emit("cursorMove", { x, y });
  };

  // Canvas drawing handlers (pen only for now)
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool !== "pen") return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    isDrawingRef.current = true;

    // use latest color + width from refs
    const stroke: Stroke = {
      tool: "pen",
      color: strokeColorRef.current,
      width: strokeWidthRef.current,
      points: [{ x, y }],
    };

    currentStrokeRef.current = stroke;
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    if (activeTool !== "pen") return;

    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    const stroke = currentStrokeRef.current;
    if (!ctx || !canvas || !stroke) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const lastPoint = stroke.points[stroke.points.length - 1];
    stroke.points.push({ x, y });

    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handleCanvasMouseUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    const stroke = currentStrokeRef.current;
    if (stroke && stroke.points.length > 1) {
      strokesRef.current = [...strokesRef.current, stroke];
    }
    currentStrokeRef.current = null;
  };

  const handleCanvasMouseLeave = () => {
    if (!isDrawingRef.current) return;
    handleCanvasMouseUp();
  };

  return (
    <div style={{ padding: 16 }}>
      <h1>Board: {boardId}</h1>

      <div
        data-testid="user-list"
        style={{
          marginBottom: 16,
          padding: 8,
          border: "1px solid #ccc",
          borderRadius: 4,
          maxWidth: 300,
        }}
      >
        <strong>Users in room:</strong>
        <ul>
          {users.map((user) => (
            <li key={user.id}>{user.name}</li>
          ))}
        </ul>
      </div>

      {/* Tools */}
      <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => setActiveTool("pen")}
          style={{
            padding: "4px 8px",
            borderRadius: 4,
            border: activeTool === "pen" ? "2px solid #007bff" : "1px solid #ccc",
            background: activeTool === "pen" ? "#e6f0ff" : "#fff",
          }}
        >
          Pen
        </button>
        <button
          type="button"
          data-testid="tool-rectangle"
          onClick={() => setActiveTool("rectangle")}
          style={{
            padding: "4px 8px",
            borderRadius: 4,
            border: activeTool === "rectangle" ? "2px solid #007bff" : "1px solid #ccc",
            background: activeTool === "rectangle" ? "#e6f0ff" : "#fff",
          }}
        >
          Rectangle
        </button>
        <label style={{ marginLeft: 16 }}>
          Color:{" "}
          <input
            type="color"
            value={strokeColor}
            onChange={(e) => setStrokeColor(e.target.value)}
          />
        </label>
        <label style={{ marginLeft: 16 }}>
          Brush size:{" "}
          <input
            type="range"
            min={1}
            max={20}
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
          />
          <span style={{ marginLeft: 4 }}>{strokeWidth}</span>
        </label>
      </div>

      <div
        ref={containerRef}
        onMouseMove={handleMouseMoveContainer}
        style={{
          position: "relative",
          border: "1px solid #ddd",
          height: 400,
          marginTop: 8,
          overflow: "hidden",
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseLeave}
          style={{ display: "block", width: "100%", height: "100%", cursor: "crosshair" }}
        />

        {Object.values(remoteCursors).map((cursor) => (
          <div
            key={cursor.userId}
            data-testid="remote-cursor"
            style={{
              position: "absolute",
              left: cursor.x,
              top: cursor.y,
              width: 12,
              height: 12,
              borderRadius: "50%",
              backgroundColor: "#f00",
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default BoardPage;