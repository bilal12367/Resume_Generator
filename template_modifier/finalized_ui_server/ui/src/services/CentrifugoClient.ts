/**
 * CentrifugoClient.ts
 *
 * Object-Oriented Centrifugo WebSocket Connection & Subscription Manager
 * for React Frontend Applications.
 */

export interface CentrifugoConfig {
  wsUrl?: string;
  token?: string;
  userId?: string;
  autoReconnect?: boolean;
  reconnectIntervalMs?: number;
}

export interface CentrifugoPushEvent {
  channel: string;
  pub: {
    data: any;
    offset?: number;
  };
}

export type EventCallback = (data: any, channel: string) => void;

export class CentrifugoClient {
  private wsUrl: string;
  private token: string | null = null;
  private userId: string;
  private autoReconnect: boolean;
  private reconnectIntervalMs: number;

  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private isConnecting: boolean = false;
  private cmdIdSequence: number = 1;

  private subscriptions: Map<string, Set<EventCallback>> = new Map();
  private pendingSubscribes: Set<string> = new Set();
  private reconnectTimer: number | null = null;

  constructor(config: CentrifugoConfig = {}) {
    this.wsUrl = config.wsUrl || 'ws://localhost:8008/connection/websocket';
    this.token = config.token || null;
    this.userId = config.userId || 'user_demo';
    this.autoReconnect = config.autoReconnect !== false;
    this.reconnectIntervalMs = config.reconnectIntervalMs || 3000;
  }

  /**
   * Sets or updates connection token.
   */
  public setToken(token: string): void {
    this.token = token;
  }

  public getUserId(): string {
    return this.userId;
  }

  /**
   * Connects to Centrifugo WebSocket server and authenticates with JWT.
   */
  public async connect(token?: string): Promise<boolean> {
    if (token) {
      this.token = token;
    }

    if (this.isConnected) {
      return true;
    }

    if (this.isConnecting) {
      return new Promise((resolve) => {
        const check = setInterval(() => {
          if (this.isConnected) {
            clearInterval(check);
            resolve(true);
          }
        }, 100);
      });
    }

    this.isConnecting = true;

    return new Promise((resolve) => {
      try {
        console.log(`[CentrifugoClient] Connecting to ${this.wsUrl}...`);
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          console.log('[CentrifugoClient] WebSocket transport opened. Sending connect command...');
          this.sendConnectCommand();
        };

        this.ws.onmessage = (event: MessageEvent) => {
          this.handleMessage(event, resolve);
        };

        this.ws.onerror = (error) => {
          console.error('[CentrifugoClient] WebSocket error:', error);
          this.isConnecting = false;
          resolve(false);
        };

        this.ws.onclose = () => {
          console.warn('[CentrifugoClient] Connection closed.');
          this.isConnected = false;
          this.isConnecting = false;
          if (this.autoReconnect) {
            this.scheduleReconnect();
          }
        };
      } catch (err) {
        console.error('[CentrifugoClient] Exception during connection setup:', err);
        this.isConnecting = false;
        resolve(false);
      }
    });
  }

  /**
   * Subscribes to a channel and registers an event listener callback.
   * Returns an unsubscribe function for React useEffect cleanups.
   */
  public subscribe(channel: string, callback: EventCallback): () => void {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }

    const callbacks = this.subscriptions.get(channel)!;
    callbacks.add(callback);

    if (this.isConnected) {
      this.sendSubscribeCommand(channel);
    } else {
      this.pendingSubscribes.add(channel);
    }

    return () => {
      this.unsubscribe(channel, callback);
    };
  }

  /**
   * Unsubscribes callback from channel.
   */
  public unsubscribe(channel: string, callback?: EventCallback): void {
    if (!this.subscriptions.has(channel)) {
      return;
    }

    const callbacks = this.subscriptions.get(channel)!;
    if (callback) {
      callbacks.delete(callback);
    } else {
      callbacks.clear();
    }

    if (callbacks.size === 0) {
      this.subscriptions.delete(channel);
      this.pendingSubscribes.delete(channel);
      if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
        this.sendCommand({
          id: this.nextCmdId(),
          unsubscribe: { channel },
        });
      }
    }
  }

  /**
   * Disconnects WebSocket connection and clears reconnect timers.
   */
  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.autoReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
    console.log('[CentrifugoClient] Disconnected cleanly.');
  }

  private sendConnectCommand(): void {
    const cmd: any = {
      id: this.nextCmdId(),
      connect: {},
    };
    if (this.token) {
      cmd.connect.token = this.token;
    }
    this.sendCommand(cmd);
  }

  private sendSubscribeCommand(channel: string): void {
    const cmd = {
      id: this.nextCmdId(),
      subscribe: {
        channel: channel,
      },
    };
    this.sendCommand(cmd);
    console.log(`[CentrifugoClient] Sent subscribe command for channel '${channel}'`);
  }

  private sendCommand(cmd: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(cmd));
    }
  }

  private nextCmdId(): number {
    return this.cmdIdSequence++;
  }

  private handleMessage(event: MessageEvent, connectResolver?: (val: boolean) => void): void {
    try {
      const data = JSON.parse(event.data);

      // Handle Connect ACK response
      if (data.connect || (data.id === 1 && data.result)) {
        console.log('✅ [CentrifugoClient] Successfully connected to Centrifugo server!');
        this.isConnected = true;
        this.isConnecting = false;

        if (connectResolver) {
          connectResolver(true);
        }

        // Resubscribe to active channels
        for (const channel of this.subscriptions.keys()) {
          this.sendSubscribeCommand(channel);
        }
        for (const channel of this.pendingSubscribes) {
          this.sendSubscribeCommand(channel);
        }
        this.pendingSubscribes.clear();
        return;
      }

      // Handle Push publication frames
      let channel: string | null = null;
      let pubData: any = null;

      if (data.push) {
        channel = data.push.channel || null;
        pubData = data.push.pub ? data.push.pub.data : (data.push.data || data.push);
      } else if (data.pub) {
        channel = data.channel || (data.pub.channel || null);
        pubData = data.pub.data || data.pub;
      } else if (data.channel && (data.data || data.pub)) {
        channel = data.channel;
        pubData = data.data || (data.pub ? data.pub.data : null);
      }

      if (channel && pubData) {
        console.log(`⚡ [Centrifugo Event] Channel '${channel}':`, pubData);
        const callbacks = this.subscriptions.get(channel);
        if (callbacks) {
          callbacks.forEach((cb) => {
            try {
              cb(pubData, channel);
            } catch (err) {
              console.error(`Error in event callback for channel ${channel}:`, err);
            }
          });
        }
      }
    } catch (e) {
      console.error('[CentrifugoClient] Error parsing incoming WebSocket message:', e, event.data);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    console.log(`[CentrifugoClient] Reconnecting in ${this.reconnectIntervalMs}ms...`);
    this.reconnectTimer = window.setTimeout(async () => {
      this.reconnectTimer = null;
      await this.connect();
    }, this.reconnectIntervalMs);
  }
}
