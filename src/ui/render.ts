import { type GameState, PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH, getColorForCell } from "../game/state";
import { getShape, PIECE_COLORS, type Piece, type PieceType } from "../game/tetromino";

export type RenderTargets = {
  board: HTMLCanvasElement;
  next: HTMLCanvasElement;
  hold: HTMLCanvasElement;
  scoreEl: HTMLElement;
  levelEl: HTMLElement;
  linesEl: HTMLElement;
};

const BLOCK = 32; // px per cell in main board (fits 320x640)

export function render(state: GameState, targets: RenderTargets) {
  renderBoard(state, targets.board);
  renderQueue(state, targets.next);
  renderHold(state, targets.hold);
  targets.scoreEl.textContent = String(state.score);
  targets.levelEl.textContent = String(state.level);
  targets.linesEl.textContent = String(state.lines);
}

function renderBoard(state: GameState, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // Grid
  ctx.fillStyle = "#111433";
  for (let y = 0; y < PLAYFIELD_HEIGHT - 2; y++) {
    for (let x = 0; x < PLAYFIELD_WIDTH; x++) {
      ctx.fillRect(x*BLOCK+1, y*BLOCK+1, BLOCK-2, BLOCK-2);
    }
  }

  // Locked
  for (let y = 2; y < PLAYFIELD_HEIGHT; y++) {
    for (let x = 0; x < PLAYFIELD_WIDTH; x++) {
      const cell = state.field[y][x];
      if (!cell) continue;
      drawBlock(ctx, x, y-2, PIECE_COLORS[cell]);
    }
  }

  // Active piece
  if (state.active) {
    const shape = getShape(state.active);
    for (let py = 0; py < 4; py++) {
      for (let px = 0; px < 4; px++) {
        if (!shape[py][px]) continue;
        const x = state.active.x + px;
        const y = state.active.y + py - 2; // shift for hidden rows
        if (y >= 0) drawBlock(ctx, x, y, PIECE_COLORS[state.active.type]);
      }
    }
  }
}

function drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  const r = 8;
  const px = x*BLOCK;
  const py = y*BLOCK;
  ctx.fillStyle = color;
  roundRect(ctx, px+1, py+1, BLOCK-2, BLOCK-2, r);
  ctx.fill();
  // bevel
  const g = ctx.createLinearGradient(px, py, px, py+BLOCK);
  g.addColorStop(0, "rgba(255,255,255,0.25)");
  g.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = g;
  roundRect(ctx, px+1, py+1, BLOCK-2, BLOCK-2, r);
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

function renderQueue(state: GameState, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const items = state.queue.slice(0,3);
  const outerMargin = 12; // slightly reduce margin to allow bigger items
  const lane = Math.floor((canvas.height - outerMargin*2) / items.length);
  const scale = 0.95; // bump size a bit
  const cell = Math.max(12, Math.floor((lane / 4) * scale));
  const box = 4 * cell; // 4x4 box size
  const x = Math.floor((canvas.width - box) / 2);
  items.forEach((type, i) => {
    const laneTop = outerMargin + i * lane;
    const y = laneTop + Math.floor((lane - box) / 2);
    drawMini(ctx, type, x, y, cell);
  });
}

function renderHold(state: GameState, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if (!state.hold) return;
  // Center mini in hold box
  const cell = 18;
  const box = 4 * cell;
  const x = Math.floor((canvas.width - box) / 2);
  const y = Math.floor((canvas.height - box) / 2);
  drawMini(ctx, state.hold, x, y, cell);
}

function drawMini(ctx: CanvasRenderingContext2D, type: PieceType, x: number, y: number, cell: number) {
  // Draw within a 4x4 box at (x,y), centered per shape bounds
  const color = PIECE_COLORS[type];
  const shapes: Record<PieceType, number[][]> = {
    // Show I horizontally in previews (next/hold)
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    O: [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    T: [[0,1,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    S: [[0,1,1,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]],
    Z: [[1,1,0,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    J: [[1,0,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    L: [[0,0,1,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
  };
  // Compute bounds
  let minX = 4, minY = 4, maxX = -1, maxY = -1;
  for (let py = 0; py < 4; py++) {
    for (let px = 0; px < 4; px++) {
      if (!shapes[type][py][px]) continue;
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
  }
  const w = (maxX - minX + 1);
  const h = (maxY - minY + 1);
  const offsetX = Math.floor((4 - w) / 2) * cell - minX * cell;
  const offsetY = Math.floor((4 - h) / 2) * cell - minY * cell;

  for (let py = 0; py < 4; py++) {
    for (let px = 0; px < 4; px++) {
      if (!shapes[type][py][px]) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + offsetX + px*cell + 1, y + offsetY + py*cell + 1, cell-2, cell-2);
    }
  }
}
