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

type PenStroke = {
  type: "pen";
  color: string;
  width: number;
  points: { x: number; y: number }[];
};

type RectShape = {
  type: "rectangle";
  color: string;
  width: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

type CanvasObject = PenStroke | RectShape;

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

  const strokeColorRef = useRef<string>(strokeColor);
  const strokeWidthRef = useRef<number>(strokeWidth);
  

  useEffect(() => {
    strokeColorRef.current = strokeColor;
  }, [strokeColor]);

  useEffect(() => {
    strokeWidthRef.current = strokeWidth;
  }, [strokeWidth]);

  // Drawing state
  const isDrawingRef = useRef(false);
  const currentPenRef = useRef<PenStroke | null>(null);
  const rectStartRef = useRef<{ x: number; y: number } | null>(null);
  const currentRectRef = useRef<RectShape | null>(null);
  const objectsRef = useRef<CanvasObject[]>([]);

  // Helper: redraw everything from objectsRef
  const redrawAll = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const obj of objectsRef.current) {
      if (obj.type === "pen") {
        if (obj.points.length < 2) continue;
        ctx.strokeStyle = obj.color;
        ctx.lineWidth = obj.width;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(obj.points[0].x, obj.points[0].y);
        for (let i = 1; i < obj.points.length; i++) {
          ctx.lineTo(obj.points[i].x, obj.points[i].y);
        }
        ctx.stroke();
      } else if (obj.type === "rectangle") {
        ctx.strokeStyle = obj.color;
        ctx.lineWidth = obj.width;
        ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);
      }
    }
  };

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
        objects: objectsRef.current,
      };
    };

    return () => {
      (window as any).getCanvasAsJSON = undefined;
    };
  }, []);

  // Socket.io: join room + roomUsers + cursorUpdate + drawing updates
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

    const handleDrawUpdate = (payload: { stroke: CanvasObject }) => {
      if (payload.stroke.type !== "pen") return;
      objectsRef.current = [...objectsRef.current, payload.stroke];
      redrawAll();
    };

    const handleObjectAdded = (payload: { object: CanvasObject }) => {
      objectsRef.current = [...objectsRef.current, payload.object];
      redrawAll();
    };

    socket.on("roomUsers", handleRoomUsers);
    socket.on("cursorUpdate", handleCursorUpdate);
    socket.on("drawUpdate", handleDrawUpdate);
    socket.on("objectAdded", handleObjectAdded);

    return () => {
      socket.off("roomUsers", handleRoomUsers);
      socket.off("cursorUpdate", handleCursorUpdate);
      socket.off("drawUpdate", handleDrawUpdate);
      socket.off("objectAdded", handleObjectAdded);
    };
  }, [boardId]);

  // Local mouse move -> cursorMove event (for remote cursors)
  const handleMouseMoveContainer = (e: React.MouseEvent<HTMLDivElement>) => {
    const socket = getSocket();
    if (!socket.connected) return;

    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    socket.emit("cursorMove", { x, y });
  };

  const getLocalPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  // Canvas mouse handlers
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getLocalPos(e);
    isDrawingRef.current = true;

    if (activeTool === "pen") {
      const stroke: PenStroke = {
        type: "pen",
        color: strokeColorRef.current,
        width: strokeWidthRef.current,
        points: [{ x, y }],
      };
      currentPenRef.current = stroke;
    } else if (activeTool === "rectangle") {
      rectStartRef.current = { x, y };
      currentRectRef.current = {
        type: "rectangle",
        color: strokeColorRef.current,
        width: strokeWidthRef.current,
        x,
        y,
        w: 0,
        h: 0,
      };
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;

    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    const { x, y } = getLocalPos(e);

    if (activeTool === "pen") {
      const stroke = currentPenRef.current;
      if (!stroke) return;

      const last = stroke.points[stroke.points.length - 1];
      stroke.points.push({ x, y });

      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (activeTool === "rectangle") {
      const start = rectStartRef.current;
      const rectObj = currentRectRef.current;
      if (!start || !rectObj) return;

      const w = x - start.x;
      const h = y - start.y;

      rectObj.x = w < 0 ? x : start.x;
      rectObj.y = h < 0 ? y : start.y;
      rectObj.w = Math.abs(w);
      rectObj.h = Math.abs(h);

      redrawAll();
      ctx.strokeStyle = rectObj.color;
      ctx.lineWidth = rectObj.width;
      ctx.strokeRect(rectObj.x, rectObj.y, rectObj.w, rectObj.h);
    }
  };

  const finishCurrentShape = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    const socket = getSocket();

    if (activeTool === "pen") {
      const stroke = currentPenRef.current;
      if (stroke && stroke.points.length > 1) {
        objectsRef.current = [...objectsRef.current, stroke];
        if (boardId) {
          socket.emit("draw", { boardId, stroke });
        }
      }
      currentPenRef.current = null;
    } else if (activeTool === "rectangle") {
      const rectObj = currentRectRef.current;
      if (rectObj && rectObj.w > 0 && rectObj.h > 0) {
        objectsRef.current = [...objectsRef.current, rectObj];
        if (boardId) {
          socket.emit("addObject", { boardId, object: rectObj });
        }
      }
      rectStartRef.current = null;
      currentRectRef.current = null;
      redrawAll();
    }
  };

  const handleCanvasMouseUp = () => {
    finishCurrentShape();
  };

  const handleCanvasMouseLeave = () => {
    finishCurrentShape();
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