import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type RoomEvent =
  | { type: 'state'; payload: OpponentState }
  | { type: 'join'; payload: { userId: string } }
  | { type: 'leave'; payload: { userId: string } }
  | { type: 'ready'; payload: { userId: string; ready: boolean } }
  | { type: 'start'; payload: { seed: number; at: number } };

export type OpponentState = {
  field: number[][]; // 22x10
  active: { type: string; x: number; y: number; rotation: number } | null;
  score: number;
  level: number;
  lines: number;
  status: 'playing' | 'gameover' | 'paused';
};

export class RealtimeClient {
  private supa: SupabaseClient;
  private channel: ReturnType<SupabaseClient['channel']> | null = null;
  private roomId: string | null = null;
  private userId: string;

  constructor(url: string, anonKey: string) {
    this.supa = createClient(url, anonKey, {
      realtime: { params: { eventsPerSecond: 20 } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.userId = crypto.randomUUID();
  }

  join(roomId: string, onMessage: (evt: RoomEvent) => void) {
    this.roomId = roomId;
    const channel = this.supa.channel(`room:${roomId}`, { config: { broadcast: { ack: true } } });
    channel.on('broadcast', { event: 'message' }, (payload) => {
      try { onMessage(payload.payload as RoomEvent); } catch {}
    });
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        this.send({ type: 'join', payload: { userId: this.userId } });
      }
    });
    this.channel = channel;
  }

  leave() {
    if (this.channel) {
      this.send({ type: 'leave', payload: { userId: this.userId } });
      this.supa.removeChannel(this.channel);
      this.channel = null;
    }
    this.roomId = null;
  }

  send(evt: RoomEvent) {
    if (!this.channel) return;
    this.channel.send({ type: 'broadcast', event: 'message', payload: evt });
  }
}
