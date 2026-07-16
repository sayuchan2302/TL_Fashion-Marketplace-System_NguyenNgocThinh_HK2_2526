import { Client, type IMessage, type StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client/dist/sockjs.min.js';
import { authService } from './authService';
import type { NotificationRealtimePayload } from './notificationApiService';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const buildSocketUrl = () => (API_BASE ? `${API_BASE}/ws` : '/ws');

interface NotificationSocketHandlers {
  onMessage: (payload: NotificationRealtimePayload) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

class NotificationSocketService {
  private client: Client | null = null;
  private subscription: StompSubscription | null = null;

  connect(handlers: NotificationSocketHandlers) {
    this.disconnect();

    const client = new Client({
      webSocketFactory: () => new SockJS(buildSocketUrl()),
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      beforeConnect: async () => {
        const token = await this.resolveAuthToken();
        if (!token) {
          throw new Error('Missing backend JWT for notification socket');
        }
        client.connectHeaders = {
          Authorization: `Bearer ${token}`,
        };
      },
      onConnect: () => {
        this.subscription = client.subscribe('/user/queue/notifications', (frame) => {
          const payload = this.parsePayload(frame);
          if (payload) {
            handlers.onMessage(payload);
          }
        });
        handlers.onConnect?.();
      },
      onWebSocketClose: () => {
        handlers.onDisconnect?.();
      },
      onStompError: () => {
        // Keep silent in production UI; reconnect is managed by stompjs.
      },
    });

    client.activate();
    this.client = client;
  }

  disconnect() {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
    if (this.client) {
      void this.client.deactivate();
      this.client = null;
    }
  }

  private parsePayload(frame: IMessage): NotificationRealtimePayload | null {
    try {
      const parsed = JSON.parse(frame.body) as NotificationRealtimePayload;
      return parsed;
    } catch {
      return null;
    }
  }

  private async resolveAuthToken(): Promise<string | null> {
    const session = authService.getSession() || authService.getAdminSession();
    const token = session?.token || null;
    if (!token || !authService.isBackendJwtToken(token)) {
      return null;
    }
    if (!authService.isJwtExpired(token)) {
      return token;
    }
    if (!authService.getRefreshToken()) {
      authService.logout('session-expired');
      return null;
    }
    try {
      const refreshed = await authService.refresh();
      return refreshed.token;
    } catch {
      return null;
    }
  }
}

export const notificationSocketService = new NotificationSocketService();
