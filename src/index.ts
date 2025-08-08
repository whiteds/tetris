import { GameLoop } from "./engine/loop";
import { Input } from "./engine/input";
import { type GameState, createInitialState, tick as advance, move, rotate, hardDrop, hold as doHold, reset } from "./game/state";
import { render as draw, type RenderTargets } from "./ui/render";

const board = document.getElementById("board") as HTMLCanvasElement;
const next = document.getElementById("next") as HTMLCanvasElement;
const hold = document.getElementById("hold") as HTMLCanvasElement;
const scoreEl = document.getElementById("score")!;
const levelEl = document.getElementById("level")!;
const linesEl = document.getElementById("lines")!;
const btnPause = document.getElementById("btn-pause") as HTMLButtonElement;
const btnRestart = document.getElementById("btn-restart") as HTMLButtonElement;

const targets: RenderTargets = { board, next, hold, scoreEl, levelEl, linesEl };

const input = new Input();
input.attach();

const state: GameState = createInitialState();
let paused = false;

btnPause.addEventListener("click", () => togglePause());
btnRestart.addEventListener("click", () => { reset(state); paused = false; btnPause.textContent = "Pause"; });

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
  },
  render: () => draw(state, targets),
});

loop.start();
