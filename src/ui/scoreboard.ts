export type ScoreEntry = {
  name: string;
  score: number;
  level?: number;
  lines?: number;
  date: string; // ISO
};

const STORAGE_KEY = "tetris_highscores";
const API_BASE = (window as any).__TETRIS_API__ as string | undefined; // legacy
type SupaCfg = { url: string; anonKey: string } | undefined;
function getSupabase(): SupaCfg {
  const anyWin: any = window as any;
  const cfg = anyWin.__SUPABASE__ as SupaCfg;
  if (!cfg || !cfg.url || !cfg.anonKey) return undefined;
  return cfg;
}
const MAX_ENTRIES = 10;

export function loadHighScores(): ScoreEntry[] {
  try {
    // Supabase REST-first
    const SUPA = getSupabase();
    if (SUPA?.url && SUPA?.anonKey) {
      const q = new URL(`${SUPA.url.replace(/\/$/, '')}/rest/v1/scores`);
      q.searchParams.set('select', 'name,score,level,lines,created_at');
      q.searchParams.set('order', 'score.desc,created_at.desc');
      q.searchParams.set('limit', '10');
      const xhr = new XMLHttpRequest();
      xhr.open("GET", q.toString(), false);
      xhr.setRequestHeader('apikey', SUPA.anonKey);
      xhr.setRequestHeader('Authorization', `Bearer ${SUPA.anonKey}`);
      xhr.send();
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText) as Array<{ name: string; score: number; level?: number; lines?: number; created_at?: string }>;
        const mapped: ScoreEntry[] = data.map(d => ({ name: d.name, score: d.score, level: d.level, lines: d.lines, date: d.created_at ?? new Date().toISOString() }));
        return mapped;
      }
    }
    // Legacy custom server
    if (API_BASE) {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", `${API_BASE}/scores?limit=10`, false);
      xhr.send();
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText) as Array<{ name: string; score: number; level?: number; lines?: number; createdAt?: string; created_at?: string }>;
        const mapped: ScoreEntry[] = data.map(d => ({ name: d.name, score: d.score, level: d.level, lines: d.lines, date: d.createdAt ?? d.created_at ?? new Date().toISOString() }));
        return mapped;
      }
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function saveHighScores(entries: ScoreEntry[]): void {
  const sanitized = entries
    .filter(isValidEntry)
    .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date))
    .slice(0, MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
}

export function qualifiesAsHighScore(score: number, entries: ScoreEntry[] = loadHighScores()): boolean {
  // Allow filling the leaderboard even with low/zero scores until it has MAX_ENTRIES
  if (entries.length < MAX_ENTRIES) return true;
  const lowest = entries[entries.length - 1]?.score ?? 0;
  return score > lowest;
}

export function addHighScore(name: string, score: number, extra?: { level?: number; lines?: number }): { rank: number; entries: ScoreEntry[] } {
  const now = new Date().toISOString();
  const entry: ScoreEntry = { name: name.trim() || "Anonymous", score, level: extra?.level, lines: extra?.lines, date: now };
  try {
    const SUPA = getSupabase();
    if (SUPA?.url && SUPA?.anonKey) {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${SUPA.url.replace(/\/$/, '')}/rest/v1/scores`, false);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader('apikey', SUPA.anonKey);
      xhr.setRequestHeader('Authorization', `Bearer ${SUPA.anonKey}`);
      xhr.setRequestHeader('Prefer', 'return=representation');
      xhr.send(JSON.stringify({ name: entry.name, score: entry.score, level: entry.level ?? 1, lines: entry.lines ?? 0 }));
      if (xhr.status >= 200 && xhr.status < 300) {
        const [row] = JSON.parse(xhr.responseText);
        if (row?.created_at) entry.date = row.created_at;
        if (typeof row?.level === 'number') entry.level = row.level;
        if (typeof row?.lines === 'number') entry.lines = row.lines;
      }
    } else 
    if (API_BASE) {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}/scores`, false);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(JSON.stringify({ name: entry.name, score: entry.score, level: entry.level, lines: entry.lines }));
    }
  } catch {}
  const entries = loadHighScores();
  // Also persist locally for offline view
  entries.push(entry);
  entries.sort((a, b) => b.score - a.score || b.date.localeCompare(a.date));
  const top = entries.slice(0, MAX_ENTRIES);
  saveHighScores(top);
  const rank = top.findIndex(e => e === entry) + 1 || top.findIndex(e => e.score === score) + 1 || -1;
  return { rank, entries: top };
}

export function renderScoreboard(container: HTMLElement, entries: ScoreEntry[] = loadHighScores()): void {
  container.innerHTML = createMarkup(entries);
}

function isValidEntry(v: any): v is ScoreEntry {
  return v && typeof v.name === "string" && typeof v.score === "number" && typeof v.date === "string";
}

function createMarkup(entries: ScoreEntry[]): string {
  if (entries.length === 0) {
    return `<div class="scoreboard__empty">No high scores yet. Be the first!</div>`;
  }
  const header = `<div class="scoreboard__header"><span class="rank">#</span><span class="name">Name</span><span class="score">Score</span><span class=\"level\">Level</span><span class=\"lines\">Lines</span><span class="date">Date</span></div>`;
  const rows = entries
    .map((e, i) => {
      const rank = i + 1;
      const date = formatDateTime(e.date);
      const level = typeof e.level === 'number' ? e.level : '-';
      const lines = typeof e.lines === 'number' ? e.lines : '-';
      return `<div class="scoreboard__row"><span class="rank">${rank}</span><span class="name">${escapeHtml(e.name)}</span><span class="score">${e.score.toLocaleString()}</span><span class=\"level\">${level}</span><span class=\"lines\">${lines}</span><span class="date">${date}</span></div>`;
    })
    .join("");
  return `<div class="scoreboard__wrap"><div class="scoreboard__title">High Scores</div>${header}${rows}</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c] as string));
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

// Compute rank (1-based) for a given name using server if available; fallback to local entries
export function computeRankForName(name: string): number | null {
  const SUPA = getSupabase();
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  try {
    if (SUPA?.url && SUPA?.anonKey) {
      // Fetch best score for this name
      const q1 = new URL(`${SUPA.url.replace(/\/$/, '')}/rest/v1/scores`);
      q1.searchParams.set('select', 'score');
      q1.searchParams.set('name', `eq.${encodeURIComponent(trimmed)}`);
      q1.searchParams.set('order', 'score.desc');
      q1.searchParams.set('limit', '1');
      const xhr1 = new XMLHttpRequest();
      xhr1.open('GET', q1.toString(), false);
      xhr1.setRequestHeader('apikey', SUPA.anonKey);
      xhr1.setRequestHeader('Authorization', `Bearer ${SUPA.anonKey}`);
      xhr1.send();
      if (!(xhr1.status >= 200 && xhr1.status < 300)) return null;
      const bestArr = JSON.parse(xhr1.responseText) as Array<{ score: number }>;
      const bestScore = bestArr?.[0]?.score;
      if (typeof bestScore !== 'number') return null;
      // Count how many scores are greater than bestScore
      const q2 = new URL(`${SUPA.url.replace(/\/$/, '')}/rest/v1/scores`);
      q2.searchParams.set('select', 'score');
      q2.searchParams.set('score', `gt.${bestScore}`);
      q2.searchParams.set('limit', '1');
      const xhr2 = new XMLHttpRequest();
      xhr2.open('GET', q2.toString(), false);
      xhr2.setRequestHeader('apikey', SUPA.anonKey);
      xhr2.setRequestHeader('Authorization', `Bearer ${SUPA.anonKey}`);
      xhr2.setRequestHeader('Prefer', 'count=exact');
      xhr2.send();
      const range = xhr2.getResponseHeader('Content-Range');
      if (!range) return 1; // no higher scores
      const total = parseInt(range.split('/')[1] || '0', 10);
      if (!isFinite(total)) return 1;
      return total + 1;
    }
  } catch {}
  // Fallback: local ranking by highest score for this name
  const entries = loadHighScores();
  const nameBest = entries.filter(e => e.name === trimmed).sort((a,b)=>b.score-a.score)[0]?.score;
  if (typeof nameBest !== 'number') return null;
  const higher = entries.filter(e => e.score > nameBest).length;
  return higher + 1;
}
