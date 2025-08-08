import type { Piece, PieceType, Rotation } from "./tetromino";
import { getShape, bagGenerator, PIECE_COLORS } from "./tetromino";

export const PLAYFIELD_WIDTH = 10;
export const PLAYFIELD_HEIGHT = 22; // 20 visible + 2 buffer

export type Cell = PieceType | 0;

export type GameStatus = "menu" | "playing" | "paused" | "gameover";

export type GameState = {
  field: Cell[][]; // [y][x]
  active: Piece | null;
  hold: PieceType | null;
  holdLocked: boolean;
  queue: PieceType[];
  bag: Generator<PieceType, never, unknown>;
  score: number;
  level: number;
  lines: number;
  gravityMs: number;
  gravityTimer: number;
  lockDelayMs: number;
  lockTimer: number;
  status: GameStatus;
};

export function createEmptyField(): Cell[][] {
  return Array.from({ length: PLAYFIELD_HEIGHT }, () => Array(PLAYFIELD_WIDTH).fill(0));
}

export function createInitialState(): GameState {
  const bag = bagGenerator();
  const state: GameState = {
    field: createEmptyField(),
    active: null,
    hold: null,
    holdLocked: false,
    queue: [],
    bag,
    score: 0,
    level: 1,
    lines: 0,
    gravityMs: 1000,
    gravityTimer: 0,
    lockDelayMs: 500,
    lockTimer: 0,
    status: "playing",
  };
  refillQueue(state);
  spawn(state);
  return state;
}

function refillQueue(state: GameState) {
  while (state.queue.length < 5) {
    state.queue.push(state.bag.next().value);
  }
}

function spawn(state: GameState) {
  const type = state.queue.shift()!;
  refillQueue(state);
  const piece: Piece = { type, rotation: 0, x: 3, y: 0 };
  if (collides(state, piece)) {
    state.status = "gameover";
    return;
  }
  state.active = piece;
  state.holdLocked = false;
}

export function hardDropY(state: GameState, piece: Piece): number {
  let y = piece.y;
  while (!collides(state, { ...piece, y: y + 1 })) y++;
  return y;
}

export function move(state: GameState, dx: number, dy: number): boolean {
  if (!state.active) return false;
  const next = { ...state.active, x: state.active.x + dx, y: state.active.y + dy };
  if (!collides(state, next)) {
    state.active = next;
    return true;
  }
  return false;
}

export function rotate(state: GameState, dir: 1 | -1): boolean {
  if (!state.active) return false;
  const nextRot = (((state.active.rotation + dir) % 4) + 4) % 4 as Rotation;
  const tests = srsKicks(state.active.type, state.active.rotation, nextRot);
  for (const [dx, dy] of tests) {
    const next = { ...state.active, rotation: nextRot, x: state.active.x + dx, y: state.active.y + dy };
    if (!collides(state, next)) {
      state.active = next;
      return true;
    }
  }
  return false;
}

function srsKicks(type: PieceType, from: Rotation, to: Rotation): Array<[number, number]> {
  // Minimal SRS kicks for I and JLSTZ; O has none
  const JLSTZ = [
    [[0,0],[ -1,0],[ -1,1],[0,-2],[ -1,-2]], // 0->R
    [[0,0],[ 1,0],[ 1,-1],[0,2],[ 1,2]],    // R->2
    [[0,0],[ 1,0],[ 1,1],[0,-2],[ 1,-2]],   // 2->L
    [[0,0],[ -1,0],[ -1,-1],[0,2],[ -1,2]], // L->0
  ];
  const I = [
    [[0,0],[ -2,0],[ 1,0],[ -2,-1],[ 1,2]], // 0->R
    [[0,0],[ -1,0],[ 2,0],[ -1,2],[ 2,-1]], // R->2
    [[0,0],[ 2,0],[ -1,0],[ 2,1],[ -1,-2]], // 2->L
    [[0,0],[ 1,0],[ -2,0],[ 1,-2],[ -2,1]], // L->0
  ];
  if (type === "O") return [[0,0]];
  const table = type === "I" ? I : JLSTZ;
  const index = ((from === 0 && to === 1) || (from === 1 && to === 2) || (from === 2 && to === 3) || (from === 3 && to === 0)) ? (from % 4) : ((from + 3) % 4);
  return table[index] as Array<[number, number]>;
}

export function collides(state: GameState, piece: Piece): boolean {
  const shape = getShape(piece);
  for (let py = 0; py < 4; py++) {
    for (let px = 0; px < 4; px++) {
      if (!shape[py][px]) continue;
      const x = piece.x + px;
      const y = piece.y + py;
      if (x < 0 || x >= PLAYFIELD_WIDTH || y >= PLAYFIELD_HEIGHT) return true;
      if (y >= 0 && state.field[y][x]) return true;
    }
  }
  return false;
}

export function tick(state: GameState, dtMs: number) {
  if (state.status !== "playing") return;
  state.gravityTimer += dtMs;
  let fell = false;
  while (state.gravityTimer >= state.gravityMs) {
    state.gravityTimer -= state.gravityMs;
    fell = move(state, 0, 1) || fell;
  }
  if (!fell) {
    // On ground: accumulate lock delay by real time
    if (state.active && collides(state, { ...state.active, y: state.active.y + 1 })) {
      state.lockTimer += dtMs;
      if (state.lockTimer >= state.lockDelayMs) {
        lockPiece(state);
        clearLines(state);
        updateSpeed(state);
        spawn(state);
        state.lockTimer = 0;
      }
    } else {
      state.lockTimer = 0;
    }
  } else {
    state.lockTimer = 0;
  }
}

export function hold(state: GameState) {
  if (!state.active || state.holdLocked) return;
  const current = state.active.type;
  if (state.hold === null) {
    state.hold = current;
    spawn(state);
  } else {
    const temp = state.hold;
    state.hold = current;
    state.active = { type: temp, rotation: 0, x: 3, y: 0 };
    if (collides(state, state.active)) state.status = "gameover";
  }
  state.holdLocked = true;
}

export function hardDrop(state: GameState) {
  if (!state.active) return;
  state.active.y = hardDropY(state, state.active);
  lockPiece(state);
  clearLines(state);
  updateSpeed(state);
  spawn(state);
  state.lockTimer = 0;
}

function lockPiece(state: GameState) {
  if (!state.active) return;
  const shape = getShape(state.active);
  for (let py = 0; py < 4; py++) {
    for (let px = 0; px < 4; px++) {
      if (!shape[py][px]) continue;
      const x = state.active.x + px;
      const y = state.active.y + py;
      if (y >= 0 && y < PLAYFIELD_HEIGHT && x >= 0 && x < PLAYFIELD_WIDTH) {
        state.field[y][x] = state.active.type;
      }
    }
  }
  state.active = null;
}

function clearLines(state: GameState) {
  let cleared = 0;
  for (let y = PLAYFIELD_HEIGHT - 1; y >= 0; y--) {
    if (state.field[y].every(cell => cell !== 0)) {
      state.field.splice(y, 1);
      state.field.unshift(Array(PLAYFIELD_WIDTH).fill(0));
      cleared++;
      y++; // re-check the same row index after collapse
    }
  }
  if (cleared > 0) {
    state.lines += cleared;
    state.score += scoreForClears(cleared, state.level);
  }
}

function scoreForClears(clears: number, level: number): number {
  const base = [0, 100, 300, 500, 800][clears] ?? 0;
  return base * level;
}

function updateSpeed(state: GameState) {
  // Simple speed curve; can be tuned later
  state.level = Math.floor(state.lines / 10) + 1;
  state.gravityMs = Math.max(60, 1000 - (state.level - 1) * 80);
}

export function reset(state: GameState) {
  const fresh = createInitialState();
  Object.assign(state, fresh);
}

export function getColorForCell(cell: Cell): string | null {
  if (cell === 0) return null;
  return PIECE_COLORS[cell];
}
