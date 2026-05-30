# Collaborative Whiteboard

A simple collaborative whiteboard with real-time drawing, remote cursors, and basic tools (pen, rectangle) built with React, TypeScript, Node.js, Express, and Socket.IO.

## Features

- Real-time rooms with a shared **board ID**.
- **User list** per room (`data-testid="user-list"`).
- **Remote cursors** that track mouse movement (`data-testid="remote-cursor"`).
- **Pen tool**:
  - Freehand drawing.
  - Configurable **color** and **brush size**.
- **Rectangle tool**:
  - Click–drag–release to draw rectangles.
  - Uses current color and brush size.
- **Undo**:
  - Removes the last drawn shape (pen stroke or rectangle) on the current client.
- **JSON export**:
  - `window.getCanvasAsJSON()` returns all drawn objects (pen strokes + rectangles).
- Socket.IO-based real-time sync for all drawing actions between clients.

## Tech Stack

- **Frontend**
  - React + TypeScript
  - React Router
  - Socket.IO client
- **Backend**
  - Node.js + TypeScript
  - Express
  - Socket.IO server
- **Dev / Tooling**
  - Docker + Docker Compose

## Getting Started

### Prerequisites

- Node.js (if running without Docker)
- Docker & Docker Compose (recommended)
- npm or yarn

### Run with Docker (recommended)

From the project root:

```bash
docker compose up --build
```

Once everything starts:

- Frontend: http://localhost:3000  
- Backend: http://localhost:3001  
- Health check: http://localhost:3001/health

Stop:

```bash
docker compose down
```

### Run locally without Docker (optional)

Backend:

```bash
cd backend
npm install
npm run dev
# Backend runs on http://localhost:3001
```

Frontend:

```bash
cd frontend
npm install
npm run dev
# Frontend runs on http://localhost:3000
```

Make sure the backend CORS and Socket.IO config allow `http://localhost:3000`.

## Usage

1. Open the app in your browser:

   ```text
   http://localhost:3000/board/test-room
   ```

2. Open the same URL in a second tab or browser window to simulate another user.
3. Both users are listed in the **Users in room** panel.
4. Move your mouse over the board area to see **remote cursors** appear in the other tab.
5. Use the **toolbar**:
   - **Pen**: freehand drawing.
   - **Rectangle**: click, drag, and release to draw a rectangle.
   - **Color**: choose stroke color with the color picker.
   - **Size**: adjust brush width with the range slider.
   - **Undo**: remove the last drawn shape in the current tab.

### JSON export

In the browser DevTools console:

```js
window.getCanvasAsJSON()
```

Returns:

```ts
{
  objects: Array<
    | {
        type: "pen";
        color: string;
        width: number;
        points: { x: number; y: number }[];
      }
    | {
        type: "rectangle";
        color: string;
        width: number;
        x: number;
        y: number;
        w: number;
        h: number;
      }
  >;
}
```

This captures the current board state for integration or tests.

## Architecture Overview

- Each **board** is identified by a `boardId` from the URL (`/board/:boardId`).
- On load, the frontend:
  - Connects to the Socket.IO server.
  - Emits `joinRoom` with the `boardId`.
- Backend:
  - Tracks room membership.
  - Emits `roomUsers` to keep the user list in sync.
  - Listens for:
    - `cursorMove` → broadcasts `cursorUpdate`.
    - `draw` → broadcasts `drawUpdate` for pen strokes.
    - `addObject` → broadcasts `objectAdded` for rectangles.
- Frontend:
  - Maintains a local `objectsRef` of all shapes.
  - Redraws the canvas whenever local or remote objects change.
  - Exposes the board via `window.getCanvasAsJSON()`.

## Development Notes

- Drawing is handled via a plain `<canvas>` element:
  - For pens: incremental line segments per mouse move.
  - For rectangles: a temporary preview while dragging, then commit on mouse up.
- Undo is **local-only** and does not broadcast to other clients.
- Simple inline styles are used for a clean, minimal UI without extra dependencies.

## Possible Improvements

- Broadcast undo/redo to all clients.
- Persist board state in a database.
- Add more tools (eraser, text, selection).
- Support zoom/pan and multiple pages.