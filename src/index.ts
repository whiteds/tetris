import { GameLoop } from "./engine/loop";
import { Input } from "./engine/input";
import { type GameState, type GameStatus, createInitialState, tick as advance, move, rotate, hardDrop, hold as doHold, reset, addGarbage } from "./game/state";
import { render as draw, type RenderTargets } from "./ui/render";
import { RealtimeClient } from "./net/realtime";
import { LobbyClient, type LobbyRoom } from "./net/lobby";
import { renderScoreboard, loadHighScores, qualifiesAsHighScore, addHighScore } from "./ui/scoreboard";

const board = document.getElementById("board") as HTMLCanvasElement;
const next = document.getElementById("next") as HTMLCanvasElement;
const hold = document.getElementById("hold") as HTMLCanvasElement;
const scoreEl = document.getElementById("score")!;
const levelEl = document.getElementById("level")!;
const linesEl = document.getElementById("lines")!;
const btnPause = document.getElementById("btn-pause") as HTMLButtonElement;
const btnRestart = document.getElementById("btn-restart") as HTMLButtonElement;
const scoreboardEl = document.getElementById("scoreboard");
const opponentCanvas = document.getElementById("opponent") as HTMLCanvasElement | null;
const roomInput = document.getElementById("room-id") as HTMLInputElement | null;
const roomLabel = document.getElementById("room-label") as HTMLElement | null;
const btnJoin = document.getElementById("btn-join") as HTMLButtonElement | null;
const btnLeave = document.getElementById("btn-leave") as HTMLButtonElement | null;
const btnReady = document.getElementById("btn-ready") as HTMLButtonElement | null;
const btnStart = document.getElementById("btn-start") as HTMLButtonElement | null;
const btnLobby = document.getElementById("btn-lobby") as HTMLButtonElement | null;
const btnCreate = document.getElementById("btn-create") as HTMLButtonElement | null;
const btnCloseLobby = document.getElementById("btn-close-lobby") as HTMLButtonElement | null;
const lobbyEl = document.getElementById("lobby") as HTMLElement | null;
const roomListEl = document.getElementById("room-list") as HTMLElement | null;
const nicknameInput = document.getElementById("nickname") as HTMLInputElement | null;

const targets: RenderTargets = { board, next, hold, scoreEl, levelEl, linesEl };

const input = new Input();
input.attach();

const state: GameState = createInitialState();
let paused = false;
let lastStatus: GameStatus = state.status;

// Realtime (optional)
type OppState = {
  field: number[][];
  active: { type: string; x: number; y: number; rotation: number } | null;
  score: number; level: number; lines: number; status: GameStatus;
  attack?: number;
};
let realtime: RealtimeClient | null = null;
let opponentState: OppState | null = null;
let lastSentLines = 0;
let ready = false;
let lobby: LobbyClient | null = null;

btnPause.addEventListener("click", () => togglePause());
btnRestart.addEventListener("click", () => { reset(state); paused = false; btnPause.textContent = "Pause"; });
btnJoin?.addEventListener("click", () => {
  const anyWin: any = window as any;
  const supa = anyWin.__SUPABASE__;
  const roomId = (roomInput?.value?.trim() || localStorage.getItem('tetris_room') || '').trim();
  if (!supa?.url || !supa?.anonKey || !roomId) return;
  if (realtime) realtime.leave();
  realtime = new RealtimeClient(supa.url, supa.anonKey);
  realtime.join(roomId, (evt) => {
    if (evt.type === 'state') {
      const payload = evt.payload as OppState;
      opponentState = payload;
      if (payload.attack && payload.attack > 0) {
        addGarbage(state, payload.attack);
      }
      renderOpponent();
    } else if (evt.type === 'start') {
      // Start signal: construct new seeded game and delay start to 'at'
      const now = performance.now();
      const delay = Math.max(0, evt.payload.at - now);
      setTimeout(() => {
        Object.assign(state, createInitialState(evt.payload.seed));
        paused = false;
        btnPause.textContent = "Pause";
      }, delay);
    }
  });
  roomLabel && (roomLabel.textContent = `Room: ${roomId}`);
  localStorage.removeItem('tetris_room');
});
btnLeave?.addEventListener("click", () => { realtime?.leave(); opponentState = null; renderOpponent(); });
btnReady?.addEventListener("click", () => { ready = !ready; btnReady.textContent = ready ? 'Ready ✔' : 'Ready'; realtime?.send({ type: 'ready', payload: { userId: 'me', ready } } as any); });
btnStart?.addEventListener("click", () => {
  // Host-side manual start: send seed and synchronized start time (now+2s)
  const seed = Math.floor(Math.random() * 0x7fffffff);
  const at = performance.now() + 2000;
  realtime?.send({ type: 'start', payload: { seed, at } } as any);
  // Also start locally with same timing
  setTimeout(() => {
    Object.assign(state, createInitialState(seed));
    paused = false; btnPause.textContent = "Pause";
  }, 2000);
});

// Lobby wiring
btnLobby?.addEventListener("click", () => {
  const anyWin: any = window as any;
  const supa = anyWin.__SUPABASE__;
  if (!supa?.url || !supa?.anonKey || !lobbyEl) return;
  lobbyEl.style.display = lobbyEl.style.display === 'none' ? 'block' : 'none';
  if (!lobby) {
    lobby = new LobbyClient(supa.url, supa.anonKey);
    lobby.onUpdate = (rooms) => renderRoomList(rooms);
    lobby.join(nicknameInput?.value || 'Anonymous');
  }
});
btnCloseLobby?.addEventListener("click", () => { if (lobbyEl) lobbyEl.style.display = 'none'; });
btnCreate?.addEventListener("click", () => {
  if (!lobby) return;
  const id = lobby.createRoom("Room");
  if (roomInput) roomInput.value = id;
});

function renderRoomList(rooms: LobbyRoom[]) {
  if (!roomListEl) return;
  roomListEl.innerHTML = rooms.map(r => `<div class="row" style="justify-content:space-between;"><span>${r.id} • ${r.host}</span><span>${r.players}/${r.max}</span></div>`).join("");
}

function togglePause() {
  paused = !paused;
  btnPause.textContent = paused ? "Resume" : "Pause";
}

function handleInput() {
  if (input.consume("pause")) togglePause();
  if (input.consume("restart")) { reset(state); paused = false; btnPause.textContent = "Pause"; }
  if (paused || state.status !== "playing") return;

  const movedLeft = input.consume("left");
  const movedRight = input.consume("right");
  if (movedLeft) move(state, -1, 0);
  if (movedRight) move(state, 1, 0);

  if (input.consume("softDrop")) move(state, 0, 1);

  if (input.consume("rotateCW")) rotate(state, 1);
  if (input.consume("rotateCCW")) rotate(state, -1);

  if (input.consume("hardDrop")) hardDrop(state);

  if (input.consume("hold")) doHold(state);
}

const loop = new GameLoop({
  update: (dt) => {
    handleInput();
    if (!paused) advance(state, dt);
    // Broadcast lightweight snapshot ~10/s via requestAnimationFrame cadence
    maybeBroadcast();
    if (lastStatus !== state.status) {
      if (state.status === "gameover") handleGameOver();
      lastStatus = state.status;
    }
  },
  render: () => draw(state, targets),
});

loop.start();

// Inject Supabase config from Vite envs (if provided)
const supaUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
const supaAnon = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
if (supaUrl && supaAnon) {
  (window as any).__SUPABASE__ = { url: supaUrl, anonKey: supaAnon };
}

// Initial scoreboard render (only if present on this page)
if (scoreboardEl) {
  renderScoreboard(scoreboardEl as HTMLElement, loadHighScores());
}
adjustScoreboardLayout();
window.addEventListener("resize", adjustScoreboardLayout);

// Expose minimal control API for host pages (back/confirm, etc.)
(window as any).__tetris = {
  getStatus: () => state.status,
  isPaused: () => paused,
  pause: () => { if (!paused) togglePause(); },
};

function handleGameOver() {
  const score = state.score;
  const entries = loadHighScores();
  if (qualifiesAsHighScore(score, entries)) {
    // Use existing nickname without prompting again
    const saved1 = (localStorage.getItem("tetris_player_name") || "").trim();
    const saved2 = (localStorage.getItem("tetris_nick") || "").trim();
    const name = saved1 || saved2 || "Anonymous";
    addHighScore(name, score, { level: state.level, lines: state.lines });
  }
  if (scoreboardEl) {
    renderScoreboard(scoreboardEl as HTMLElement, loadHighScores());
    adjustScoreboardLayout();
  }
  // Notify host pages to update their own scoreboards
  try { window.dispatchEvent(new CustomEvent('tetris:score-updated')); } catch {}
}

function adjustScoreboardLayout() {
  if (!scoreboardEl) return;
  // Ensure scoreboard does not overlap the board: cap its max height and enable scrolling
  const margin = 16;
  const viewportH = window.innerHeight;
  const boardRect = board.getBoundingClientRect();
  const available = Math.max(120, viewportH - (boardRect.bottom + margin) - margin);
  (scoreboardEl as HTMLElement).style.maxHeight = `${available}px`;
  (scoreboardEl as HTMLElement).style.overflowY = "auto";
  // Add bottom padding so content above doesn't get obscured in small viewports
  document.body.style.paddingBottom = `${Math.ceil((scoreboardEl as HTMLElement).getBoundingClientRect().height) + margin}px`;
}

// Networking helpers
let lastSent = 0;
function maybeBroadcast() {
  if (!realtime) return;
  const now = performance.now();
  if (now - lastSent < 100) return; // 10 Hz
  lastSent = now;
  if (!state) return;
  // Simple garbage: send 1 line per 2 lines cleared since last send
  const deltaLines = Math.max(0, state.lines - lastSentLines);
  lastSentLines = state.lines;
  const attack = Math.floor(deltaLines / 2);
  const payload: OppState = {
    field: state.field.map(row => row.map(cell => (cell ? 1 : 0))),
    active: state.active ? { type: state.active.type, x: state.active.x, y: state.active.y, rotation: state.active.rotation } : null,
    score: state.score, level: state.level, lines: state.lines, status: state.status,
    attack: attack > 0 ? attack : undefined,
  };
  realtime.send({ type: 'state', payload } as any);
}

function renderOpponent() {
  if (!opponentCanvas) return;
  const ctx = opponentCanvas.getContext('2d')!;
  ctx.clearRect(0,0,opponentCanvas.width, opponentCanvas.height);
  if (!opponentState) return;
  // Simple render: draw locked field only to avoid heavy logic reuse
  const cell = 32;
  const ox = Math.floor((opponentCanvas.width - 10*cell)/2);
  const oy = Math.floor((opponentCanvas.height - 20*cell)/2);
  for (let y = 2; y < opponentState.field.length; y++) {
    for (let x = 0; x < opponentState.field[0].length; x++) {
      const v = opponentState.field[y][x];
      if (!v) continue;
      ctx.fillStyle = '#6ea8fe';
      ctx.fillRect(ox + x*cell + 1, oy + (y-2)*cell + 1, cell-2, cell-2);
    }
  }
}
