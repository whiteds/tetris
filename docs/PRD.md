## Tetris Web Game - Product Requirements Document (PRD)

### 1. Goal
Build a responsive, modern, web-based Tetris playable on desktop browsers with keyboard controls. Ship a polished MVP in one page with clean code and baseline tests.

### 2. Users & Use Cases
- Casual players visit a link and immediately play for a quick break.
- Developers open the codebase to study clear game-loop, rendering, and input architecture.

### 3. Scope
- MVP game loop with seven tetrominoes (I, O, T, S, Z, J, L) using a 7-bag randomizer
- Playfield 10×20 (invisible 20 high, with a 2–4 row buffer for spawn safety)
- Controls: Left/Right, Soft Drop, Hard Drop, Rotate CW/CCW, Hold piece, Pause/Resume, Restart
- Rotation: SRS (Super Rotation System) kicks
- Gravity, lock delay, line clear detection (single/double/triple/tetris)
- Scoring: Guideline-inspired simple scoring; level increases with cleared lines; increasing gravity speed
- Next queue: show next 5
- Hold queue: single slot with swap rules (no repeated holds without piece placement)
- Game over on block out
- Sound effects (optional toggle)
- Minimal accessibility: high-contrast color palette and focusable buttons

Out of scope for MVP: T-spins detection, combos, ghosts finesse training, replays, multiplayer.

### 4. Non-Functional Requirements
- Performance: 60 FPS target; no jank on mid-range laptops
- Code quality: modular, testable, commented where non-obvious
- No external frameworks for core loop; only minimal tooling
- Works offline (basic PWA optional post-MVP)

### 5. Architecture
- Core modules:
  - `engine/loop.ts`: fixed timestep loop (render at raf)
  - `engine/input.ts`: keyboard handler with remappable bindings
  - `game/tetromino.ts`: shapes, rotations, SRS kicks, bag generator
  - `game/state.ts`: playfield, active/hold/queue, scoring, level, gravity, lock delay
  - `game/rules.ts`: scoring tables, speed curves
  - `ui/render.ts`: canvas renderer
  - `ui/hud.ts`: next/hold/score/level/lines display
  - `ui/sounds.ts`: simple WebAudio
  - `index.ts`: wire-up

### 6. Success Metrics
- Game runs smoothly for 2+ minutes without missed inputs
- No known logic bugs in rotation, line clear, or scoring
- Lighthouse performance score > 90 on desktop

### 7. Milestones
- M1: Scaffolding, PRD, canvas board with static piece
- M2: Movement, rotation with SRS, collision, gravity, lock delay
- M3: Line clears, scoring, levels, next/hold
- M4: Hard drop, pause/restart, game over, polish
- M5: Tests for key modules, simple CI

### 8. Risks
- SRS kick tables complexity; mitigate with unit tests
- Input repeat/ DAS nuance — simple repeat for MVP

### 9. Controls (Default)
- Left/Right: ArrowLeft/ArrowRight
- Soft Drop: ArrowDown
- Hard Drop: Space
- Rotate CW: X or ArrowUp
- Rotate CCW: Z
- Hold: C
- Pause: P
- Restart: R
