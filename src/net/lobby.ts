import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type LobbyRoom = {
  id: string;
  host: string;
  title: string;
  players: number; // 1 or 2
  max: number; // 2
  updatedAt: number; // ms
};

export class LobbyClient {
  private supa: SupabaseClient;
  private channel: ReturnType<SupabaseClient['channel']>;
  private rooms = new Map<string, LobbyRoom>();
  private nickname = 'Anonymous';
  private heartbeatTimer: any = null;
  private myRoomId: string | null = null;

  constructor(url: string, anonKey: string) {
    this.supa = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    this.channel = this.supa.channel('lobby', { config: { broadcast: { ack: true } } });
    this.channel.on('broadcast', { event: 'room' }, (payload) => {
      const data = payload.payload as LobbyRoom;
      this.rooms.set(data.id, data);
      this.prune();
      this.onUpdate?.(this.getRooms());
    });
    this.channel.subscribe();
    setInterval(() => this.prune(), 3000);
  }

  onUpdate?: (rooms: LobbyRoom[]) => void;

  join(nickname: string) { this.nickname = nickname || 'Anonymous'; }

  getRooms(): LobbyRoom[] {
    const list = Array.from(this.rooms.values());
    list.sort((a,b) => (b.updatedAt - a.updatedAt));
    return list;
  }

  createRoom(title: string): string {
    const id = `room-${Math.random().toString(36).slice(2, 8)}`;
    this.myRoomId = id;
    this.sendHeartbeat(1, title || 'Room');
    this.heartbeatTimer && clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(1, title || 'Room'), 4000);
    return id;
  }

  updatePlayers(count: number) {
    if (!this.myRoomId) return;
    this.sendHeartbeat(Math.max(1, Math.min(2, count)));
  }

  closeRoom() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (this.myRoomId) this.rooms.delete(this.myRoomId);
    this.myRoomId = null;
    this.onUpdate?.(this.getRooms());
  }

  private sendHeartbeat(players: number, title?: string) {
    if (!this.myRoomId) return;
    const prev = this.rooms.get(this.myRoomId);
    const room: LobbyRoom = { id: this.myRoomId, host: this.nickname, title: title ?? prev?.title ?? 'Room', players, max: 2, updatedAt: Date.now() };
    this.rooms.set(room.id, room);
    this.channel.send({ type: 'broadcast', event: 'room', payload: room });
    this.onUpdate?.(this.getRooms());
  }

  private prune() {
    const now = Date.now();
    for (const [id, r] of this.rooms) {
      if (now - r.updatedAt > 15000) this.rooms.delete(id);
    }
  }
}
