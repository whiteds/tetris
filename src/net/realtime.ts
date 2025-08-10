import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type RoomEvent =
  | { type: 'state'; payload: OpponentState }
  | { type: 'join'; payload: { userId: string; name?: string } }
  | { type: 'leave'; payload: { userId: string } }
  | { type: 'ready'; payload: { userId: string; ready: boolean } }
  | { type: 'start'; payload: { seed: number; at: number } }
  | { type: 'host_info'; payload: { userId: string; name: string } }
  | { type: 'ping'; payload: { timestamp: number } }
  | { type: 'pong'; payload: { timestamp: number; serverTime: number } };

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
  private messageHandler: ((evt: RoomEvent) => void) | null = null;
  private playerName: string | null = null;
  private reconnectTimer: any = null;

  constructor(url: string, anonKey: string) {
    this.supa = createClient(url, anonKey, {
      realtime: { params: { eventsPerSecond: 20 } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.userId = crypto.randomUUID();
    
    // Monitor page visibility changes
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.channel) {
          console.log('[Realtime] Page became visible, checking connection...');
          this.checkAndReconnect();
        }
      });
    }
  }

  join(roomId: string, onMessage: (evt: RoomEvent) => void, name?: string) {
    this.roomId = roomId;
    this.messageHandler = onMessage;
    this.playerName = name || null;
    console.log(`[Realtime] Joining room: ${roomId} as ${name} (${this.userId})`);
    
    const channel = this.supa.channel(`room:${roomId}`, { 
      config: { 
        broadcast: { 
          ack: true,
          self: false  // Don't receive our own messages
        } 
      } 
    });
    
    channel.on('broadcast', { event: 'message' }, (payload) => {
      const evt = payload.payload as RoomEvent;
      console.log(`[Realtime] Received broadcast message:`, evt.type, evt.payload);
      console.log(`[Realtime] From channel:`, this.roomId);
      console.log(`[Realtime] Channel subscription status:`, channel.state);
      
      // Don't process our own messages for certain events (but still log them)
      if (evt.type === 'join' || evt.type === 'leave') {
        const eventUserId = (evt.payload as any).userId;
        console.log(`[Realtime] Message userId: ${eventUserId}, My userId: ${this.userId}`);
        if (eventUserId === this.userId) {
          console.log('[Realtime] Ignoring own message');
          return;
        }
      }
      
      // For ready messages, always pass them through (host needs to see guest's ready)
      if (evt.type === 'ready') {
        const eventUserId = (evt.payload as any).userId;
        console.log(`[Realtime] Ready message - userId: ${eventUserId}, My userId: ${this.userId}`);
        console.log(`[Realtime] Passing ready message to handler`);
      }
      
      try { 
        onMessage(evt); 
      } catch (e) {
        console.error('[Realtime] Error processing message:', e);
      }
    });
    
    channel.subscribe((status) => {
      console.log(`[Realtime] Channel status: ${status}`);
      if (status === 'SUBSCRIBED') {
        console.log(`[Realtime] Successfully subscribed, sending join message`);
        this.send({ type: 'join', payload: { userId: this.userId, name } });
        
        // Clear any existing reconnect timer
        if (this.reconnectTimer) {
          clearInterval(this.reconnectTimer);
        }
        
        // Set up periodic connection check
        this.reconnectTimer = setInterval(() => {
          this.checkAndReconnect();
        }, 5000); // Check every 5 seconds
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.log('[Realtime] Connection error, attempting to reconnect...');
        this.reconnect();
      }
    });
    
    this.channel = channel;
  }
  
  checkAndReconnect() {
    if (!this.channel) return;
    
    const state = this.channel.state;
    console.log(`[Realtime] Connection check - state: ${state}`);
    
    if (state !== 'joined' && state !== 'joining') {
      console.log('[Realtime] Connection lost, reconnecting...');
      this.reconnect();
    }
  }
  
  private reconnect() {
    if (!this.roomId || !this.messageHandler) return;
    
    console.log('[Realtime] Attempting to reconnect...');
    
    // Remove old channel if exists
    if (this.channel) {
      this.supa.removeChannel(this.channel);
      this.channel = null;
    }
    
    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Rejoin with same parameters
    setTimeout(() => {
      if (this.roomId && this.messageHandler) {
        this.join(this.roomId, this.messageHandler, this.playerName || undefined);
      }
    }, 1000); // Wait 1 second before reconnecting
  }

  leave() {
    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.channel) {
      this.send({ type: 'leave', payload: { userId: this.userId } });
      this.supa.removeChannel(this.channel);
      this.channel = null;
    }
    this.roomId = null;
    this.messageHandler = null;
    this.playerName = null;
  }

  send(evt: RoomEvent) {
    if (!this.channel) {
      console.warn('[Realtime] Cannot send - no channel');
      return;
    }
    console.log(`[Realtime] Sending message:`, evt.type, evt.payload);
    console.log(`[Realtime] To room:`, this.roomId);
    console.log(`[Realtime] Channel state:`, this.channel.state);
    this.channel.send({ type: 'broadcast', event: 'message', payload: evt })
      .then(() => console.log('[Realtime] Message sent successfully'))
      .catch((error) => console.error('[Realtime] Error sending message:', error));
  }

  getUserId(): string { return this.userId; }
}
