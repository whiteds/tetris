import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

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
  private channel: RealtimeChannel;
  public rooms = new Map<string, LobbyRoom>();
  private nickname = 'Anonymous';
  private heartbeatTimer: any = null;
  public myRoomId: string | null = null;
  public isSubscribed = false;

  constructor(url: string, anonKey: string) {
    this.supa = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    this.channel = this.supa.channel('lobby:rooms');
    
    // Track presence state changes
    this.channel
      .on('presence', { event: 'sync' }, () => {
        console.log('[Lobby] Presence sync event');
        this.syncRooms();
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('[Lobby] Presence join event:', key, newPresences);
        this.syncRooms();
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('[Lobby] Presence leave event:', key, leftPresences);
        this.syncRooms();
      })
      .subscribe(async (status) => {
        console.log('[Lobby] Channel subscribe status:', status);
        if (status === 'SUBSCRIBED') {
          this.isSubscribed = true;
          console.log('[Lobby] Successfully subscribed to lobby:rooms channel');
          // If we have a pending room, send it now
          if (this.myRoomId) {
            const room = this.rooms.get(this.myRoomId);
            await this.sendPresence(room?.players || 1, room?.title);
          }
        }
      });
  }

  onUpdate?: (rooms: LobbyRoom[]) => void;

  join(nickname: string) { 
    this.nickname = nickname || 'Anonymous';
    // Just track the user joined, don't create a room yet
  }

  getRooms(): LobbyRoom[] {
    const list = Array.from(this.rooms.values());
    list.sort((a,b) => (b.updatedAt - a.updatedAt));
    return list;
  }

  createRoom(title: string): string {
    const id = `room-${Math.random().toString(36).slice(2, 8)}`;
    this.myRoomId = id;
    
    // Store room locally first
    const room: LobbyRoom = {
      id: this.myRoomId,
      host: this.nickname,
      title: title || 'Room',
      players: 1,
      max: 2,
      updatedAt: Date.now()
    };
    this.rooms.set(room.id, room);
    
    // Send initial presence if subscribed
    if (this.isSubscribed) {
      this.sendPresence(1, title || 'Room');
    }
    
    // Set up heartbeat to keep room alive
    this.heartbeatTimer && clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.isSubscribed) {
        this.sendPresence(1, title || 'Room');
      }
    }, 4000);
    
    // Trigger update immediately for local UI
    this.onUpdate?.(this.getRooms());
    
    return id;
  }

  updatePlayers(count: number) {
    if (!this.myRoomId) return;
    const room = this.rooms.get(this.myRoomId);
    if (this.isSubscribed) {
      this.sendPresence(Math.max(1, Math.min(2, count)), room?.title);
    }
  }

  closeRoom() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    
    // Leave presence
    if (this.myRoomId && this.isSubscribed) {
      this.channel.untrack();
    }
    
    if (this.myRoomId) {
      this.rooms.delete(this.myRoomId);
    }
    
    this.myRoomId = null;
    this.onUpdate?.(this.getRooms());
  }

  private async sendPresence(players: number, title?: string) {
    if (!this.myRoomId || !this.isSubscribed) {
      console.log('[Lobby] Cannot send presence - not ready:', { myRoomId: this.myRoomId, isSubscribed: this.isSubscribed });
      return;
    }
    
    const room: LobbyRoom = { 
      id: this.myRoomId, 
      host: this.nickname, 
      title: title ?? 'Room', 
      players, 
      max: 2, 
      updatedAt: Date.now() 
    };
    
    // Update local copy
    this.rooms.set(room.id, room);
    
    console.log('[Lobby] Sending presence for room:', room);
    
    try {
      // Track presence with room data - use user-specific key
      const presenceKey = `${this.nickname}_${this.myRoomId}`;
      const result = await this.channel.track({
        user: this.nickname,
        room_id: room.id,
        room_title: room.title,
        room_host: room.host,
        room_players: room.players,
        room_max: room.max,
        online_at: new Date().toISOString(),
      }, { presenceKey });
      
      console.log('[Lobby] Track result:', result);
    } catch (error) {
      console.error('[Lobby] Error tracking presence:', error);
    }
  }

  private syncRooms() {
    const presenceState = this.channel.presenceState();
    console.log('[Lobby] Current presence state:', presenceState);
    this.rooms.clear();
    
    // Collect all rooms from presence state
    Object.keys(presenceState).forEach(key => {
      const presences = presenceState[key];
      console.log('[Lobby] Processing presence key:', key, 'presences:', presences);
      if (presences && presences.length > 0) {
        const latestPresence = presences[presences.length - 1] as any;
        if (latestPresence.room_id) {
          const room: LobbyRoom = {
            id: latestPresence.room_id,
            host: latestPresence.room_host || 'Anonymous',
            title: latestPresence.room_title || 'Room',
            players: latestPresence.room_players || 1,
            max: latestPresence.room_max || 2,
            updatedAt: Date.now()
          };
          console.log('[Lobby] Adding room to list:', room);
          this.rooms.set(room.id, room);
        }
      }
    });
    
    console.log('[Lobby] Total rooms after sync:', this.rooms.size);
    this.onUpdate?.(this.getRooms());
  }
}