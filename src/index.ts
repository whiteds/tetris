import { GameLoop } from "./engine/loop";
import { Input } from "./engine/input";
import { type GameState, type GameStatus, createInitialState, tick as advance, move, rotate, hardDrop, hold as doHold, reset, addGarbage } from "./game/state";
import { render as draw, type RenderTargets } from "./ui/render";
import { RealtimeClient } from "./net/realtime";
import { LobbyClient, type LobbyRoom } from "./net/lobby";
import { renderScoreboard, loadHighScores, qualifiesAsHighScore, addHighScore } from "./ui/scoreboard";
import { getShape, PIECE_COLORS, type PieceType, type Rotation } from "./game/tetromino";

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
let paused = true; // Start paused until game is started with opponent
let lastStatus: GameStatus = state.status;
let gameStarted = false; // Track if game has been started

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
let opponentReady = false;
let myName = (localStorage.getItem('tetris_nick') || '').trim() || 'Anonymous';
let opponentName: string | null = null;
let isHost = false; // Track if current player is the host
let hasOpponent = false; // Track if opponent is in room
let gameLobby: LobbyClient | null = null; // Track room in lobby
let gameEndScreenShown = false; // Track if end screen is already shown

// Initialize nickname display on page load
setTimeout(() => updateNameBadges(), 100);

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
      // Only update opponent state, not our own
      console.log(`[Game] Received state from opponent`);
      opponentState = payload;
      if (payload.attack && payload.attack > 0) {
        console.log(`[Game] Receiving ${payload.attack} attack lines from opponent!`);
        addGarbage(state, payload.attack);
        showAttackNotification(payload.attack);
      }
      // Check if opponent lost
      if (payload.status === 'gameover' && state.status === 'playing' && !gameEndScreenShown) {
        console.log(`[Game] Opponent lost! You win!`);
        gameEndScreenShown = true;
        showVictoryScreen();
        // Stop the game
        paused = true;
        gameStarted = false;
        btnPause.textContent = "Game Over";
      }
      renderOpponent();
    } else if (evt.type === 'host_info') {
      // Receive host information when joining as guest
      const hostPayload = evt.payload as { userId: string; name: string };
      console.log(`[Game] Received host info:`, hostPayload);
      if (!isHost && hostPayload.name) {
        opponentName = hostPayload.name;
        hasOpponent = true;
        updateNameBadges();
        updateButtonVisibility();
      }
    } else if (evt.type === 'leave') {
      if (evt.payload.userId !== realtime!.getUserId()) {
        console.log(`[Game] Opponent left: ${opponentName}`);
        showNotification(`${opponentName || 'Opponent'} left the room`);
        opponentName = null;
        hasOpponent = false;
        opponentReady = false;
        opponentState = null;
        renderOpponent();
        updateNameBadges();
        updateButtonVisibility();
        // Update lobby player count
        if (isHost && gameLobby) {
          gameLobby.updatePlayers(1);
        }
      }
    } else if (evt.type === 'join') {
      if (evt.payload.userId !== realtime!.getUserId()) {
        opponentName = evt.payload.name || 'Guest';
        hasOpponent = true;
        updateNameBadges();
        updateButtonVisibility();
        
        // Show notification that opponent joined
        console.log(`[Game] Opponent joined: ${opponentName}`);
        showNotification(`${opponentName} joined the room!`);
        
        // Update lobby player count
        if (isHost && gameLobby) {
          gameLobby.updatePlayers(2);
        }
        
        // If host, send host info to the guest who just joined
        if (isHost) {
          console.log(`[Game] Sending host info to guest`);
          realtime?.send({ type: 'host_info', payload: { userId: realtime!.getUserId(), name: myName } } as any);
        }
      }
    } else if (evt.type === 'ready') {
      console.log(`[Game] Received ready event:`, evt.payload);
      const myUserId = realtime!.getUserId();
      console.log(`[Game] My userId: ${myUserId}, Event userId: ${evt.payload.userId}`);
      
      if (evt.payload.userId !== myUserId) {
        opponentReady = evt.payload.ready;
        console.log(`[Game] Opponent ready status updated: ${opponentReady}`);
        updateButtonVisibility();
        
        // Show ready status
        if (opponentReady) {
          console.log(`[Game] Opponent is ready!`);
          showNotification(`${opponentName || 'Opponent'} is ready!`);
          updateOpponentReadyStatus(true);
        } else {
          console.log(`[Game] Opponent is not ready`);
          updateOpponentReadyStatus(false);
        }
      } else {
        console.log(`[Game] Ignoring own ready event`);
      }
    } else if (evt.type === 'start') {
      // Start signal: use absolute time for synchronization
      const now = Date.now();
      const targetTime = evt.payload.at;
      const timeUntilStart = targetTime - now;
      const countdownDelay = Math.max(0, timeUntilStart - 4000); // Start countdown 4s before game start
      
      console.log(`[Game] Guest received start signal. Target time: ${targetTime}, Current: ${now}, Delay: ${countdownDelay}ms`);
      
      // Start countdown at the right time
      setTimeout(() => {
        showCountdown(() => {
          Object.assign(state, createInitialState(evt.payload.seed));
          paused = false;
          gameStarted = true;
          gameEndScreenShown = false; // Reset end screen flag
          btnPause.textContent = "Pause";
        });
      }, countdownDelay);
    }
  }, myName);
  roomLabel && (roomLabel.textContent = `Room: ${roomId}`);
  localStorage.removeItem('tetris_room');
  updateNameBadges();
  updateButtonVisibility();
});
btnLeave?.addEventListener("click", () => { 
  realtime?.leave(); 
  opponentState = null; 
  opponentName = null;
  opponentReady = false;
  ready = false;
  gameStarted = false;
  gameEndScreenShown = false; // Reset end screen flag
  paused = true;
  hasOpponent = false;
  
  // Close room in lobby if host
  if (isHost && gameLobby) {
    gameLobby.closeRoom();
  }
  gameLobby = null;
  
  isHost = false;
  renderOpponent(); 
  updateNameBadges();
  updateButtonVisibility();
  // Clear room data from localStorage
  localStorage.removeItem('tetris_room');
  localStorage.removeItem('tetris_room_title');
  localStorage.removeItem('tetris_room_created');
  window.location.href = '../multi/';
});
btnReady?.addEventListener("click", () => { 
  ready = !ready; 
  console.log(`[Game] Ready button clicked, ready: ${ready}, isHost: ${isHost}`);
  
  if (isHost) {
    // Host doesn't need Ready, just enable/disable Start
    updateButtonVisibility();
  } else {
    btnReady.textContent = ready ? 'Ready ✔' : 'Ready'; 
    const userId = realtime?.getUserId() || 'unknown';
    console.log(`[Game] Sending ready status: ${ready}, userId: ${userId}`);
    realtime?.send({ type: 'ready', payload: { userId, ready } } as any); 
    updateButtonVisibility();
  }
});
btnStart?.addEventListener("click", () => {
  if (!hasOpponent || !opponentReady) return; // Need opponent to be ready
  
  // Check connection before starting
  if (realtime) {
    const anyRealtime = realtime as any;
    if (anyRealtime.checkAndReconnect) {
      anyRealtime.checkAndReconnect();
    }
  }
  
  // Small delay to ensure connection is established
  setTimeout(() => {
    // Host-side manual start: use absolute time for better synchronization
    const seed = Math.floor(Math.random() * 0x7fffffff);
    // Add 50ms network compensation for message delivery
    const startTime = Date.now() + 5050; // 5 seconds + 50ms network buffer
    realtime?.send({ type: 'start', payload: { seed, at: startTime } } as any);
    
    console.log(`[Game] Host starting game at absolute time: ${startTime} (in ${5050}ms)`);
    
    // Host starts countdown slightly later to compensate
    setTimeout(() => {
      showCountdown(() => {
        Object.assign(state, createInitialState(seed));
        paused = false; 
        gameStarted = true;
        gameEndScreenShown = false; // Reset end screen flag
        btnPause.textContent = "Pause";
      });
    }, 50); // 50ms delay to sync with network latency
  }, 100);
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

function updateButtonVisibility() {
  if (!btnStart || !btnReady) return;
  
  if (isHost) {
    // Host sees Start button
    btnReady.style.display = 'none';
    btnStart.style.display = 'inline-block';
    
    // Enable/disable Start based on opponent ready status
    if (hasOpponent && opponentReady) {
      btnStart.disabled = false;
      btnStart.style.opacity = '1';
      btnStart.style.cursor = 'pointer';
      btnStart.textContent = 'Start';
    } else {
      btnStart.disabled = true;
      btnStart.style.opacity = '0.5';
      btnStart.style.cursor = 'not-allowed';
      btnStart.textContent = hasOpponent ? 'Waiting Ready...' : 'Waiting for player...';
    }
  } else {
    // Guest sees Ready button
    btnStart.style.display = 'none';
    btnReady.style.display = 'inline-block';
  }
}

function updateNameBadges() {
  const myEl = document.getElementById('my-name');
  if (myEl) myEl.textContent = myName || 'Me';
  const oppEl = document.getElementById('opponent-name');
  if (oppEl) {
    if (opponentName) {
      oppEl.textContent = opponentName;
      if (opponentReady) {
        oppEl.textContent += ' ✅';
      }
    } else {
      oppEl.textContent = 'Waiting for opponent...';
    }
  }
}

function updateOpponentReadyStatus(ready: boolean) {
  const oppEl = document.getElementById('opponent-name');
  if (oppEl && opponentName) {
    oppEl.textContent = opponentName + (ready ? ' ✅' : '');
  }
}

function showNotification(message: string) {
  // Create notification element
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: #2a2f66;
    color: #e6e9ff;
    padding: 12px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 1001;
    animation: slideIn 0.3s ease-out;
  `;
  notification.textContent = message;
  
  // Add animation style
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
}

function showAttackSentNotification(lines: number) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 200, 0, 0.9);
    color: white;
    padding: 15px 30px;
    border-radius: 8px;
    font-size: 20px;
    font-weight: bold;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 1500;
    animation: slideUp 0.3s ease-out;
  `;
  notification.textContent = `💥 ${lines}줄 공격! 💥`;
  
  // Add animation style if not already added
  if (!document.getElementById('attack-sent-style')) {
    const style = document.createElement('style');
    style.id = 'attack-sent-style';
    style.textContent = `
      @keyframes slideUp {
        from { transform: translateX(-50%) translateY(20px); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  
  // Remove after 1 second
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 1000);
}

function showAttackNotification(lines: number) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(255, 0, 0, 0.9);
    color: white;
    padding: 20px 40px;
    border-radius: 12px;
    font-size: 24px;
    font-weight: bold;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    z-index: 1500;
    animation: attackPulse 0.5s ease-out;
  `;
  notification.textContent = `⚠️ ${lines}줄 공격 받음! ⚠️`;
  
  // Add animation style if not already added
  if (!document.getElementById('attack-style')) {
    const style = document.createElement('style');
    style.id = 'attack-style';
    style.textContent = `
      @keyframes attackPulse {
        0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0; }
        50% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(1); opacity: 0.9; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  
  // Remove after 1.5 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 1500);
}

function showVictoryScreen() {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    display: grid;
    place-items: center;
    z-index: 3000;
  `;
  
  const message = document.createElement('div');
  message.style.cssText = `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 40px 60px;
    border-radius: 20px;
    text-align: center;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    animation: victoryBounce 0.5s ease-out;
  `;
  
  message.innerHTML = `
    <h1 style="font-size: 48px; margin: 0 0 20px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">🎉 승리! 🎉</h1>
    <p style="font-size: 20px; margin: 0 0 10px;">상대방이 게임오버 되었습니다!</p>
    <p style="font-size: 16px; margin: 0 0 30px; opacity: 0.9;">최종 점수: ${state.score}</p>
    <button id="btn-victory-leave" style="background: white; color: #667eea; border: none; padding: 12px 30px; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer;">로비로 돌아가기</button>
  `;
  
  // Add animation style
  if (!document.getElementById('victory-style')) {
    const style = document.createElement('style');
    style.id = 'victory-style';
    style.textContent = `
      @keyframes victoryBounce {
        0% { transform: scale(0.5); opacity: 0; }
        60% { transform: scale(1.1); }
        100% { transform: scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  
  overlay.appendChild(message);
  document.body.appendChild(overlay);
  
  // Add event listener to leave button
  const leaveBtn = document.getElementById('btn-victory-leave');
  leaveBtn?.addEventListener('click', () => {
    window.location.href = '../multi/';
  });
}

function showDefeatScreen() {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    display: grid;
    place-items: center;
    z-index: 3000;
  `;
  
  const message = document.createElement('div');
  message.style.cssText = `
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    color: white;
    padding: 40px 60px;
    border-radius: 20px;
    text-align: center;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    animation: defeatFade 0.5s ease-out;
  `;
  
  message.innerHTML = `
    <h1 style="font-size: 48px; margin: 0 0 20px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">😢 패배 😢</h1>
    <p style="font-size: 20px; margin: 0 0 10px;">게임 오버!</p>
    <p style="font-size: 16px; margin: 0 0 30px; opacity: 0.9;">최종 점수: ${state.score}</p>
    <button id="btn-defeat-leave" style="background: white; color: #f5576c; border: none; padding: 12px 30px; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer;">로비로 돌아가기</button>
  `;
  
  // Add animation style
  if (!document.getElementById('defeat-style')) {
    const style = document.createElement('style');
    style.id = 'defeat-style';
    style.textContent = `
      @keyframes defeatFade {
        from { opacity: 0; transform: scale(0.9); }
        to { opacity: 1; transform: scale(1); }
      }
    `;
    document.head.appendChild(style);
  }
  
  overlay.appendChild(message);
  document.body.appendChild(overlay);
  
  // Add event listener to leave button
  const leaveBtn = document.getElementById('btn-defeat-leave');
  leaveBtn?.addEventListener('click', () => {
    window.location.href = '../multi/';
  });
}

function showCountdown(callback: () => void) {
  const counts = ['3', '2', '1', 'GO!'];
  let index = 0;
  
  const showNext = () => {
    if (index >= counts.length) {
      callback();
      return;
    }
    
    const countElement = document.createElement('div');
    countElement.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 120px;
      font-weight: 900;
      color: #ffd95d;
      text-shadow: 0 4px 12px rgba(0,0,0,0.5);
      z-index: 2000;
      animation: countPulse 1s ease-out;
      pointer-events: none;
    `;
    countElement.textContent = counts[index];
    
    // Add animation style if not already added
    if (!document.getElementById('countdown-style')) {
      const style = document.createElement('style');
      style.id = 'countdown-style';
      style.textContent = `
        @keyframes countPulse {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
          20% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
          40% { transform: translate(-50%, -50%) scale(1); }
          100% { transform: translate(-50%, -50%) scale(0.8); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(countElement);
    
    // Remove element after animation
    setTimeout(() => {
      document.body.removeChild(countElement);
    }, 1000);
    
    index++;
    if (index < counts.length) {
      setTimeout(showNext, 1000);
    } else {
      setTimeout(callback, 1000);
    }
  };
  
  showNext();
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
    if (!paused && gameStarted) advance(state, dt); // Only advance if game has started
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

// Auto-join room if room ID is stored
const storedRoom = localStorage.getItem('tetris_room');
const storedRoomTitle = localStorage.getItem('tetris_room_title');
if (storedRoom && window.location.pathname.includes('/game/')) {
  setTimeout(() => {
    const anyWin: any = window as any;
    const supa = anyWin.__SUPABASE__;
    if (supa?.url && supa?.anonKey) {
      console.log(`[Game] Auto-joining room: ${storedRoom}`);
      if (realtime) realtime.leave();
      realtime = new RealtimeClient(supa.url, supa.anonKey);
      realtime.join(storedRoom, (evt) => {
        if (evt.type === 'state') {
          const payload = evt.payload as OppState;
          // Only update opponent state, not our own
          console.log(`[Game] Received state from opponent`);
          opponentState = payload;
          if (payload.attack && payload.attack > 0) {
            console.log(`[Game] Receiving ${payload.attack} attack lines from opponent!`);
            addGarbage(state, payload.attack);
            showAttackNotification(payload.attack);
          }
          // Check if opponent lost
          if (payload.status === 'gameover' && state.status === 'playing' && !gameEndScreenShown) {
            console.log(`[Game] Opponent lost! You win!`);
            gameEndScreenShown = true;
            showVictoryScreen();
            // Stop the game
            paused = true;
            gameStarted = false;
            btnPause.textContent = "Game Over";
          }
          renderOpponent();
        } else if (evt.type === 'host_info') {
          // Receive host information when joining as guest
          const hostPayload = evt.payload as { userId: string; name: string };
          console.log(`[Game] Received host info:`, hostPayload);
          if (!isHost && hostPayload.name) {
            opponentName = hostPayload.name;
            hasOpponent = true;
            updateNameBadges();
            updateButtonVisibility();
          }
        } else if (evt.type === 'leave') {
          if (evt.payload.userId !== realtime!.getUserId()) {
            console.log(`[Game] Opponent left: ${opponentName}`);
            showNotification(`${opponentName || 'Opponent'} left the room`);
            opponentName = null;
            hasOpponent = false;
            opponentReady = false;
            opponentState = null;
            renderOpponent();
            updateNameBadges();
            updateButtonVisibility();
            // Update lobby player count
            if (isHost && gameLobby) {
              gameLobby.updatePlayers(1);
            }
          }
        } else if (evt.type === 'join') {
          if (evt.payload.userId !== realtime!.getUserId()) {
            opponentName = evt.payload.name || 'Guest';
            hasOpponent = true;
            updateNameBadges();
            updateButtonVisibility();
            
            // Show notification that opponent joined
            console.log(`[Game] Opponent joined: ${opponentName}`);
            showNotification(`${opponentName} joined the room!`);
            
            // Update lobby player count
            if (isHost && gameLobby) {
              gameLobby.updatePlayers(2);
            }
            
            // If host, send host info to the guest who just joined
            if (isHost) {
              console.log(`[Game] Sending host info to guest`);
              realtime?.send({ type: 'host_info', payload: { userId: realtime!.getUserId(), name: myName } } as any);
            }
          }
        } else if (evt.type === 'ready') {
          console.log(`[Game] Received ready event:`, evt.payload);
          const myUserId = realtime!.getUserId();
          console.log(`[Game] My userId: ${myUserId}, Event userId: ${evt.payload.userId}`);
          
          if (evt.payload.userId !== myUserId) {
            opponentReady = evt.payload.ready;
            console.log(`[Game] Opponent ready status updated: ${opponentReady}`);
            updateButtonVisibility();
            
            // Show ready status
            if (opponentReady) {
              console.log(`[Game] Opponent is ready!`);
              showNotification(`${opponentName || 'Opponent'} is ready!`);
              updateOpponentReadyStatus(true);
            } else {
              console.log(`[Game] Opponent is not ready`);
              updateOpponentReadyStatus(false);
            }
          } else {
            console.log(`[Game] Ignoring own ready event`);
          }
        } else if (evt.type === 'start') {
          // Start signal: use absolute time for synchronization
          const now = Date.now();
          const targetTime = evt.payload.at;
          const timeUntilStart = targetTime - now;
          const countdownDelay = Math.max(0, timeUntilStart - 4000); // Start countdown 4s before game start
          
          console.log(`[Game] Guest received start signal. Target time: ${targetTime}, Current: ${now}, Delay: ${countdownDelay}ms`);
          
          // Start countdown at the right time
          setTimeout(() => {
            showCountdown(() => {
              Object.assign(state, createInitialState(evt.payload.seed));
              paused = false;
              gameStarted = true;
              gameEndScreenShown = false; // Reset end screen flag
              btnPause.textContent = "Pause";
            });
          }, countdownDelay);
        }
      }, myName);
      const roomTitle = localStorage.getItem('tetris_room_title') || storedRoom;
      roomLabel && (roomLabel.textContent = `Room: ${roomTitle}`);
      
      // Check if this player created the room (is host)
      const createdRoom = localStorage.getItem('tetris_room_created');
      isHost = createdRoom === 'true';
      
      // Also create/join room in lobby to keep it alive
      if (!gameLobby) {
        gameLobby = new LobbyClient(supa.url, supa.anonKey);
        gameLobby.join(myName);
        
        if (isHost && storedRoomTitle) {
          // Host should use the SAME room ID that was stored, not create a new one
          // The room should already exist from when it was created in the lobby
          console.log('[Game] Host maintaining room in lobby:', storedRoom);
          
          // Set the room ID directly instead of creating a new one
          gameLobby.myRoomId = storedRoom;
          gameLobby.rooms.set(storedRoom, {
            id: storedRoom,
            host: myName,
            title: storedRoomTitle,
            players: 1,
            max: 2,
            updatedAt: Date.now()
          });
          
          // Send presence for the existing room
          if (gameLobby.isSubscribed) {
            gameLobby.updatePlayers(1);
          }
        }
        
        // Monitor room status
        gameLobby.onUpdate = (rooms) => {
          const myRoom = rooms.find(r => r.id === storedRoom);
          if (myRoom) {
            console.log('[Game] Room status:', myRoom);
            // Update player count if host
            if (isHost && hasOpponent) {
              gameLobby?.updatePlayers(2);
            }
          } else if (isHost && storedRoomTitle) {
            console.log('[Game] Room not found in lobby, maintaining it...');
            // Don't create a new room, maintain the existing one
            if (gameLobby) {
              gameLobby.myRoomId = storedRoom;
              gameLobby.updatePlayers(hasOpponent ? 2 : 1);
            }
          }
        };
      }
      
      updateNameBadges();
      updateButtonVisibility();
    }
  }, 500);
}

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

// Clean up room when leaving page
window.addEventListener('beforeunload', () => {
  if (isHost && gameLobby) {
    gameLobby.closeRoom();
  }
});

function handleGameOver() {
  const score = state.score;
  const entries = loadHighScores();
  
  // In multiplayer mode, show defeat screen
  if (realtime && gameStarted && opponentState && !gameEndScreenShown) {
    // Check if opponent is still playing
    if (opponentState.status === 'playing') {
      console.log('[Game] You lost! Opponent wins!');
      gameEndScreenShown = true;
      showDefeatScreen();
    }
  }
  
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
  if (!realtime || !gameStarted) return; // Only broadcast when game has started
  const now = performance.now();
  if (now - lastSent < 200) return; // 5 Hz instead of 10 Hz to reduce flickering
  lastSent = now;
  if (!state) return;
  // Send attack lines: 1 line per 1 line cleared
  const deltaLines = Math.max(0, state.lines - lastSentLines);
  lastSentLines = state.lines;
  const attack = deltaLines; // 1:1 ratio - clear 1 line, send 1 line
  
  // Show attack sent notification
  if (attack > 0 && gameStarted) {
    console.log(`[Game] Sending ${attack} attack lines to opponent!`);
    showAttackSentNotification(attack);
  }
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
  ctx.clearRect(0, 0, opponentCanvas.width, opponentCanvas.height);
  if (!opponentState) {
    // Draw empty grid when no opponent
    const cell = 32;
    const ox = Math.floor((opponentCanvas.width - 10*cell)/2);
    const oy = Math.floor((opponentCanvas.height - 20*cell)/2);
    ctx.strokeStyle = '#1f2347';
    ctx.lineWidth = 1;
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 10; x++) {
        ctx.strokeRect(ox + x*cell, oy + y*cell, cell, cell);
      }
    }
    return;
  }
  // Draw opponent's field
  const cell = 32;
  const ox = Math.floor((opponentCanvas.width - 10*cell)/2);
  const oy = Math.floor((opponentCanvas.height - 20*cell)/2);
  
  // Draw grid background
  ctx.strokeStyle = '#1f2347';
  ctx.lineWidth = 1;
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 10; x++) {
      ctx.strokeRect(ox + x*cell, oy + y*cell, cell, cell);
    }
  }
  
  // Draw locked blocks
  for (let y = 2; y < opponentState.field.length; y++) {
    for (let x = 0; x < opponentState.field[0].length; x++) {
      const v = opponentState.field[y][x];
      if (!v) continue;
      ctx.fillStyle = '#6ea8fe';
      ctx.fillRect(ox + x*cell + 1, oy + (y-2)*cell + 1, cell-2, cell-2);
    }
  }
  
  // Draw active piece if exists
  if (opponentState.active) {
    const piece = opponentState.active;
    const pieceType = piece.type as PieceType;
    const pieceRotation = piece.rotation as Rotation;
    
    // Get the shape matrix for this piece
    const shape = getShape({ 
      type: pieceType, 
      rotation: pieceRotation, 
      x: piece.x, 
      y: piece.y 
    });
    
    // Get the color for this piece type
    const color = PIECE_COLORS[pieceType];
    ctx.fillStyle = color;
    
    // Draw each block of the tetromino
    for (let py = 0; py < shape.length; py++) {
      for (let px = 0; px < shape[py].length; px++) {
        if (shape[py][px]) {
          const screenX = piece.x + px;
          const screenY = piece.y + py;
          // Only draw visible blocks (y >= 2)
          if (screenY >= 2 && screenX >= 0 && screenX < 10) {
            ctx.fillRect(
              ox + screenX * cell + 1,
              oy + (screenY - 2) * cell + 1,
              cell - 2,
              cell - 2
            );
          }
        }
      }
    }
  }
}
