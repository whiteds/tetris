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
  const cell = 20;
  const margin = 10;
  state.queue.slice(0,5).forEach((type, i) => {
    drawMini(ctx, type, margin, i*(cell*3)+margin, cell);
  });
}

function renderHold(state: GameState, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if (!state.hold) return;
  drawMini(ctx, state.hold, 10, 10, 20);
}

function drawMini(ctx: CanvasRenderingContext2D, type: PieceType, x: number, y: number, cell: number) {
  // Centering offsets for 4x4 box
  const color = PIECE_COLORS[type];
  const shapes: Record<PieceType, number[][]> = {
    I: [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
    O: [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    T: [[0,1,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    S: [[0,1,1,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]],
    Z: [[1,1,0,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    J: [[1,0,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    L: [[0,0,1,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
  };
  for (let py = 0; py < 4; py++) {
    for (let px = 0; px < 4; px++) {
      if (!shapes[type][py][px]) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + px*cell + 1, y + py*cell + 1, cell-2, cell-2);
    }
  }
}
