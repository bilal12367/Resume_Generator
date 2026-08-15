/**
 * Centrifugo Client Service
 * Manages WebSocket connection, JWT token generation, channel subscription, and event dispatching.
 */

export interface CentrifugoEvent {
  event_type: string;
  session_id?: string;
  tool_name?: string;
  kwargs?: any;
  result?: any;
  job_ids?: string[];
  tokens?: number;
  time_taken_ms?: number;
  timestamp?: string;
  message?: string;
}

export type EventCallback = (event: CentrifugoEvent) => void;

export class CentrifugoService {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private hmacSecret: string = 'a45131f8882de49f3e';
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private isConnected: boolean = false;
  private currentChannel: string = 'workflow';
  private reconnectTimer: any = null;
  private statusListeners: Set<(connected: boolean, statusText: string) => void> = new Set();

  private static getDefaultWsUrl(): string {
    const envUrl = (import.meta as any).env?.VITE_WS_URL;
    if (envUrl) return envUrl;
    // In production (served via nginx proxy), use relative /ws path
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    if (window.location.port === '3000' || window.location.port === '') {
      return `${protocol}//${window.location.host}/ws`;
    }
    // Local dev fallback
    return 'ws://localhost:8002/connection/websocket';
  }

  constructor(wsUrl?: string, hmacSecret?: string) {
    this.wsUrl = wsUrl || CentrifugoService.getDefaultWsUrl();
    if (hmacSecret) this.hmacSecret = hmacSecret;
  }


  // Base64URL encode string
  private base64url(str: string): string {
    return btoa(str)
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  // Generate lightweight JWT token for Centrifugo HS256 authentication
  public async generateJwtToken(userId: string = 'job_scraper_ui'): Promise<string> {
    try {
      const header = { alg: 'HS256', typ: 'JWT' };
      const payload = { sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 };
      
      const encHeader = this.base64url(JSON.stringify(header));
      const encPayload = this.base64url(JSON.stringify(payload));
      const dataToSign = `${encHeader}.${encPayload}`;

      // HMAC SHA-256 using SubtleCrypto
      const encoder = new TextEncoder();
      const keyData = encoder.encode(this.hmacSecret);
      const messageData = encoder.encode(dataToSign);

      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
      const signatureArray = Array.from(new Uint8Array(signatureBuffer));
      const signatureBase64 = this.base64url(String.fromCharCode(...signatureArray));

      return `${dataToSign}.${signatureBase64}`;
    } catch (e) {
      console.warn('Crypto subtle JWT generation error, falling back:', e);
      return 'demo_token';
    }
  }

  public async connect(channel: string = 'workflow') {
    this.currentChannel = channel;
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {}
    }

    this.notifyStatus(false, 'Connecting...');
    const token = await this.generateJwtToken();

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        // Step 1: Send connect command
        this.ws?.send(JSON.stringify({ id: 1, connect: { token } }));
      };

      this.ws.onmessage = (evt) => {
        try {
          const raw = evt.data;
          if (raw === '{}' || raw === '{"ping":{}}') {
            this.ws?.send('{}');
            return;
          }

          const msg = JSON.parse(raw);

          // Step 2: Handle connect response and subscribe to channel
          if (msg.id === 1 && msg.connect) {
            this.isConnected = true;
            this.notifyStatus(true, 'Connected to Centrifugo');
            
            // Subscribe to main workflow channel
            this.ws?.send(JSON.stringify({
              id: 2,
              subscribe: { channel: this.currentChannel }
            }));
            return;
          }

          // Handle incoming push/pub messages
          const pubData = msg.pub?.data || msg.push?.pub?.data || msg.result?.pub?.data;
          if (pubData) {
            this.emit(pubData);
          }
        } catch (err) {
          console.error('[Centrifugo WS Message Error]', err);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[Centrifugo WS Error]', err);
        this.isConnected = false;
        this.notifyStatus(false, 'Connection error');
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.notifyStatus(false, 'Disconnected');
        this.scheduleReconnect();
      };
    } catch (e) {
      console.error('[Centrifugo Connect Exception]', e);
      this.notifyStatus(false, 'Failed to connect');
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect(this.currentChannel);
    }, 5000);
  }

  public subscribeToSession(sessionId: string) {
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify({
        id: Math.floor(Math.random() * 10000) + 10,
        subscribe: { channel: `session_${sessionId}` }
      }));
    }
  }

  public on(event: string, callback: EventCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);
  }

  public off(event: string, callback: EventCallback) {
    this.listeners.get(event)?.delete(callback);
  }

  public onStatusChange(callback: (connected: boolean, statusText: string) => void) {
    this.statusListeners.add(callback);
    callback(this.isConnected, this.isConnected ? 'Connected to Centrifugo' : 'Disconnected');
  }

  private notifyStatus(connected: boolean, statusText: string) {
    this.statusListeners.forEach(cb => cb(connected, statusText));
  }

  private emit(eventData: CentrifugoEvent) {
    const eventType = eventData.event_type || 'all';
    this.listeners.get(eventType)?.forEach(cb => cb(eventData));
    this.listeners.get('all')?.forEach(cb => cb(eventData));
  }

  public disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.notifyStatus(false, 'Disconnected');
  }
}

export const centrifugoService = new CentrifugoService();
